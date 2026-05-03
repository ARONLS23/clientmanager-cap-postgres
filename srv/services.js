const cds = require('@sap/cds');

class ManagerClientService extends cds.ApplicationService {
    init() {
        this.on('getToken', this._getToken);

        this.on("uploadProjectDocument", this._uploadProjectDocument);
        this.on("getProjectDocumentContent", this._getProjectDocumentContent);
        this.on('getAppInfo', this._getAppInfo);
        this.on('sendTestAlert', this._sendTestAlert);

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
                .columns("ID")
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

        return tx.run(
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
}

module.exports = ManagerClientService;