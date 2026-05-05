const cds = require('@sap/cds');

class ManagerClientService extends cds.ApplicationService {
    init() {
        this.on('getToken', this._getToken);

        this.on("uploadProjectDocument", this._uploadProjectDocument);
        this.on("getProjectDocumentContent", this._getProjectDocumentContent);
        this.on('getAppInfo', this._getAppInfo);
        this.on('sendTestAlert', this._sendTestAlert);
        this.on("runScheduledHealthCheck", this._runScheduledHealthCheck);
        this.on("createUser", this._createUser);

        return super.init();
    }

    _getToken(req) {
        const token = req._.req.headers.authorization;
        return token || 'No token found';
    }

    async _uploadProjectDocument(req) {
        const { projectId, fileName, mediaType, size, description, content } = req.data;

        if (!projectId) {
            return req.error(400, "projectId is required.");
        }

        if (!fileName) {
            return req.error(400, "fileName is required.");
        }

        if (!content) {
            return req.error(400, "content is required.");
        }

        const tx = cds.tx(req);

        const { Project, Document } = cds.entities("arrows.cap.cli");
        const { Documents } = this.entities;

        const project = await tx.run(
            SELECT.one.from(Project)
                .columns("ID", "name")
                .where({ ID: projectId })
        );

        if (!project) {
            return req.error(404, "Project not found.");
        }

        const documentId = cds.utils.uuid();
        const documentContent = await this._normalizeBinaryContent(content);
        const normalizedMediaType = mediaType || "application/octet-stream";
        const documentType = this._getFileType(fileName, normalizedMediaType);

        await tx.run(
            INSERT.into(Document).entries({
                ID: documentId,
                name: fileName,
                type: documentType,
                url: this._buildDocumentUrl(documentId),
                description: description || "",
                mediaType: normalizedMediaType,
                size: size || documentContent.length,
                content: documentContent,
                project_ID: projectId
            })
        );

        const savedDocument = await tx.run(
            SELECT.one.from(Documents)
                .columns(
                    "ID",
                    "name",
                    "type",
                    "url",
                    "description",
                    "mediaType",
                    "size",
                    "project_ID",
                    "createdAt",
                    "createdBy",
                    "modifiedAt",
                    "modifiedBy"
                )
                .where({ ID: documentId })
        );

        try {
            await this._sendProjectDocumentUploadedAlert(savedDocument, project);
        } catch (error) {
            console.error("Unexpected error sending document upload alert:", error);
        }

        return savedDocument;
    }

    async _getProjectDocumentContent(req) {
        const { documentId } = req.data;

        if (!documentId) {
            return req.error(400, "documentId is required.");
        }

        const tx = cds.tx(req);
        const { Document } = cds.entities("arrows.cap.cli");

        const document = await tx.run(
            SELECT.one.from(Document)
                .columns("ID", "name", "mediaType", "content")
                .where({ ID: documentId })
        );

        if (!document) {
            return req.error(404, "Document not found.");
        }

        if (!document.content) {
            return req.error(404, "Document content not found.");
        }

        const contentBuffer = await this._normalizeBinaryContent(document.content);

        return {
            fileName: document.name,
            mediaType: document.mediaType || "application/octet-stream",
            content: contentBuffer.toString("base64")
        };
    }

    async _normalizeBinaryContent(content) {
        if (typeof content === "string") {
            const base64Content = content.includes(",")
                ? content.split(",").pop()
                : content;

            return Buffer.from(base64Content, "base64");
        }

        if (content && typeof content.pipe === "function") {
            const chunks = [];

            for await (const chunk of content) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }

            return Buffer.concat(chunks);
        }

        return Buffer.from(content);
    }

    _buildDocumentUrl(documentId) {
        return `/odata/v4/manager-client/getProjectDocumentContent(documentId=${documentId})`;
    }

    _getFileType(fileName, mediaType) {
        const extension = this._getFileExtension(fileName);

        const extensionTypes = {
            PDF: "PDF",
            DOC: "Word",
            DOCX: "Word",
            XLS: "Excel",
            XLSX: "Excel",
            PPT: "PowerPoint",
            PPTX: "PowerPoint",
            PNG: "Imagen",
            JPG: "Imagen",
            JPEG: "Imagen",
            TXT: "Texto",
            ZIP: "Comprimido"
        };

        if (extension && extensionTypes[extension]) {
            return extensionTypes[extension];
        }

        if (mediaType) {
            return mediaType;
        }

        return extension || "Archivo";
    }

    _getFileExtension(fileName) {
        if (!fileName || !fileName.includes(".")) {
            return "";
        }

        return fileName.split(".").pop().toUpperCase();
    }

    _getAppInfo() {
        return "Client Manager CAP backend - CI/CD validation v1";
    }

    async _sendTestAlert(req) {
        const { message } = req.data;

        const wasSent = await this._sendAlertNotificationEvent({
            eventType: "ClientManagerCustomAlert",
            category: "ALERT",
            severity: "INFO",
            subject: "Client Manager custom alert",
            body: message || "Custom alert sent from CAP backend.",
            resource: {
                resourceName: "clientmanager-srv",
                resourceType: "application"
            },
            tags: {
                application: "clientmanager",
                module: "backend",
                source: "cap"
            }
        });

        return wasSent ? "Alert sent" : "Alert was not sent";
    }

    async _sendAlertNotificationEvent(event) {
        const credentials = this._getAlertNotificationCredentials();

        if (!credentials) {
            console.warn("Alert Notification service credentials were not found.");
            return false;
        }

        const producerUrl = this._getAlertNotificationProducerUrl(credentials);
        const accessToken = await this._getAlertNotificationAccessToken(credentials);

        if (!producerUrl || !accessToken) {
            console.warn("Alert Notification producer URL or access token is missing.");
            return false;
        }

        const response = await fetch(producerUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(event)
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.error(
                "Could not send Alert Notification event:",
                response.status,
                responseText
            );
            return false;
        }

        return true;
    }

    _getAlertNotificationCredentials() {
        const vcapServices = JSON.parse(process.env.VCAP_SERVICES || "{}");
        const alertNotificationServices = vcapServices["alert-notification"] || [];

        const alertNotificationService = alertNotificationServices.find(
            (serviceInstance) => serviceInstance.name === "clientmanager-alert-notification"
        );

        return alertNotificationService
            ? alertNotificationService.credentials
            : null;
    }

    _getAlertNotificationProducerUrl(credentials) {
        if (!credentials.url) {
            return null;
        }

        return `${credentials.url.replace(/\/$/, "")}/cf/producer/v1/resource-events`;
    }

    async _getAlertNotificationAccessToken(credentials) {
        const tokenResponse = await fetch(credentials.oauth_url, {
            method: "POST",
            headers: {
                Authorization: "Basic " + Buffer
                    .from(`${credentials.client_id}:${credentials.client_secret}`)
                    .toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        if (!tokenResponse.ok) {
            const responseText = await tokenResponse.text();
            console.error(
                "Could not fetch Alert Notification token:",
                tokenResponse.status,
                responseText
            );
            return null;
        }

        const tokenData = await tokenResponse.json();
        return tokenData.access_token;
    }

    async _sendProjectDocumentUploadedAlert(document, project) {
        if (!document) {
            return false;
        }

        const sizeInKb = document.size ? (document.size / 1024).toFixed(2) : "0.00";

        return this._sendAlertNotificationEvent({
            eventType: "ClientManagerCustomAlert",
            category: "ALERT",
            severity: "INFO",
            subject: "Client Manager - Documento cargado",
            body: `Se subió el documento "${document.name}" al proyecto "${project.name}". Tipo: ${document.type}. Tamaño: ${sizeInKb} KB.`,
            resource: {
                resourceName: "clientmanager-srv",
                resourceType: "application"
            },
            tags: {
                application: "clientmanager",
                module: "backend",
                source: "cap",
                operation: "documentUpload",
                entity: "Document",
                outcome: "success",
                documentId: String(document.ID),
                projectId: String(document.project_ID),
                fileType: document.type || "",
                mediaType: document.mediaType || ""
            }
        });
    }

    async _runScheduledHealthCheck() {
        await this._sendAlertNotificationEvent({
            eventType: "ClientManagerScheduledJob",
            category: "ALERT",
            severity: "INFO",
            subject: "Client Manager scheduled job executed",
            body: "The scheduled health check job was executed successfully.",
            resource: {
                resourceName: "clientmanager-srv",
                resourceType: "application"
            },
            tags: {
                application: "clientmanager",
                module: "backend",
                source: "job-scheduler"
            }
        });

        return "Scheduled health check executed";
    }

    async _createUser(req) {
        const { fullName, email, userType, role, clientId } = req.data;

        try {
            const isIasUserProvisioningEnabled = await this._isFeatureEnabled("enable-ias-user-provisioning", true);

            if (!isIasUserProvisioningEnabled) {
                return req.error(
                    403,
                    "La creación de usuarios IAS está deshabilitada temporalmente."
                );
            }

            this._validateCreateUserRequest(req);

            const normalizedEmail = email.trim().toLowerCase();
            const normalizedUserType = userType.trim().toUpperCase();

            const resolvedRole = role?.trim() || "Viewer";
            const resolvedIasGroup = "ClientManagerViewer";

            const iasUser = await this._createUserInIas({
                fullName,
                email: normalizedEmail,
                iasGroup: resolvedIasGroup
            });

            const tx = cds.tx(req);
            const { User } = cds.entities("arrows.cap.cli");
            const { Users } = this.entities;
            const userId = cds.utils.uuid();

            await tx.run(
                INSERT.into(User).entries({
                    ID: userId,
                    fullName,
                    email: normalizedEmail,
                    userType: normalizedUserType,
                    role: resolvedRole,
                    status: "CREATED",
                    iasUserId: iasUser.id,
                    client_ID: clientId || null
                })
            );

            return tx.run(
                SELECT.one.from(Users).where({ ID: userId })
            );
        } catch (error) {
            console.error("[IAS] Error en creación de usuario:", error);

            return req.error(
                error.status || 500,
                error.message || "Error al crear usuario en IAS."
            );
        }
    }

    _validateCreateUserRequest(req) {
        const { fullName, email, userType, role, clientId } = req.data;

        if (!fullName) {
            const error = new Error("El nombre completo es obligatorio.");
            error.status = 400;
            throw error;
        }

        if (!email) {
            const error = new Error("El email es obligatorio.");
            error.status = 400;
            throw error;
        }

        if (!userType) {
            const error = new Error("El tipo de usuario es obligatorio.");
            error.status = 400;
            throw error;
        }

        if (userType.trim().toUpperCase() === "CLIENT" && !clientId) {
            const error = new Error("El cliente es obligatorio para usuarios de tipo CLIENT.");
            error.status = 400;
            throw error;
        }
    }

    async _createUserInIas({ fullName, email, iasGroup }) {
        const { baseUrl } = this._getIasScimCredentials();
        const userPayload = this._buildIasUserPayload({ fullName, email, iasGroup });
        const headers = this._getIasScimHeaders();

        const response = await fetch(`${baseUrl}/service/scim/Users`, {
            method: "POST",
            headers,
            body: JSON.stringify(userPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();

            if (response.status === 409) {
                const error = new Error(`Ya existe un usuario en IAS con el email ${email}.`);
                error.status = 409;
                throw error;
            }

            console.error("[IAS] Error en IAS:", response.status, errorText);

            const error = new Error(
                "Error al crear usuario en IAS. Por favor, intente nuevamente o contacte al administrador."
            );
            error.status = response.status;
            throw error;
        }

        return response.json();
    }

    _buildIasUserPayload({ fullName, email, iasGroup }) {
        const nameParts = fullName.trim().split(/\s+/);
        const givenName = nameParts.shift() || fullName;
        const familyName = nameParts.join(" ") || "-";

        return {
            schemas: [
                "urn:ietf:params:scim:schemas:core:2.0:User"
            ],
            userName: email,
            emails: [
                {
                    value: email,
                    primary: true
                }
            ],
            name: {
                givenName,
                familyName
            },
            active: true,
            groups: [
                {
                    value: iasGroup
                }
            ]
        };
    }

    _getIasScimCredentials() {
        const baseUrl = process.env.IAS_SCIM_BASE_URL;
        const clientId = process.env.IAS_SCIM_CLIENT_ID;
        const clientSecret = process.env.IAS_SCIM_CLIENT_SECRET;

        if (!baseUrl || !clientId || !clientSecret) {
            throw new Error("IAS SCIM credentials are not configured.");
        }

        return {
            baseUrl: baseUrl.replace(/\/$/, ""),
            clientId,
            clientSecret
        };
    }

    _getIasScimHeaders() {
        const { clientId, clientSecret } = this._getIasScimCredentials();

        const auth = Buffer
            .from(`${clientId}:${clientSecret}`)
            .toString("base64");

        return {
            "Content-Type": "application/scim+json",
            "Accept": "application/scim+json",
            "Authorization": `Basic ${auth}`
        };
    }

    _getFeatureFlagsCredentials() {
        const vcapServices = JSON.parse(process.env.VCAP_SERVICES || "{}");
        const featureFlagsServices = vcapServices["feature-flags"] || [];

        const featureFlagsService = featureFlagsServices.find(
            (serviceInstance) => serviceInstance.name === "clientmanager-feature-flags"
        );

        if (!featureFlagsService) {
            throw new Error("Feature Flags service binding was not found.");
        }

        return featureFlagsService.credentials;
    }

    async _isFeatureEnabled(featureName, defaultValue = true) {
        try {
            const credentials = this._getFeatureFlagsCredentials();

            if (!credentials.uri || !credentials.username || !credentials.password) {
                console.warn("[Feature Flags] Basic credentials are not available. Using default value.");
                return defaultValue;
            }

            const evaluationUrl = `${credentials.uri.replace(/\/$/, "")}/api/v1/evaluate/${featureName}`;

            const auth = Buffer
                .from(`${credentials.username}:${credentials.password}`)
                .toString("base64");

            const response = await fetch(evaluationUrl, {
                method: "GET",
                headers: {
                    Authorization: `Basic ${auth}`
                }
            });

            if (response.status === 200) {
                return true;
            }

            if (response.status === 204) {
                return false;
            }

            if (response.status === 404) {
                console.warn(`[Feature Flags] Flag ${featureName} was not found. Using default value.`);
                return defaultValue;
            }

            const responseText = await response.text();

            console.warn(
                `[Feature Flags] Could not evaluate ${featureName}: ${response.status} ${responseText}`
            );

            return defaultValue;
        } catch (error) {
            console.warn(`[Feature Flags] Error evaluating ${featureName}:`, error);
            return defaultValue;
        }
    }
}

module.exports = ManagerClientService;