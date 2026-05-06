class AlertNotificationClient {
    _getCredentials() {
        const vcapServices = JSON.parse(process.env.VCAP_SERVICES || "{}");
        const alertNotificationServices = vcapServices["alert-notification"] || [];

        const alertNotificationService = alertNotificationServices.find(
            (serviceInstance) => serviceInstance.name === "clientmanager-alert-notification"
        );

        return alertNotificationService
            ? alertNotificationService.credentials
            : null;
    }

    _getProducerUrl(credentials) {
        if (!credentials.url) {
            return null;
        }

        return `${credentials.url.replace(/\/$/, "")}/cf/producer/v1/resource-events`;
    }

    async _getAccessToken(credentials) {
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

    async sendEvent(event) {
        const credentials = this._getCredentials();

        if (!credentials) {
            console.warn("Alert Notification service credentials were not found.");
            return false;
        }

        const producerUrl = this._getProducerUrl(credentials);
        const accessToken = await this._getAccessToken(credentials);

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

    async sendTestAlert(message) {
        return this.sendEvent({
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
    }

    async sendDocumentUploadedAlert(document, project) {
        if (!document) {
            return false;
        }

        const sizeInKb = document.size ? (document.size / 1024).toFixed(2) : "0.00";

        return this.sendEvent({
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

    async sendScheduledJobAlert() {
        return this.sendEvent({
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
    }
}

module.exports = new AlertNotificationClient();