const cds = require('@sap/cds');
const alertNotification = require("./lib/alert-notification");
const redisCache = require("./lib/redis-cache");
const featureFlags = require("./lib/feature-flags");
const iasProvisioner = require("./lib/ias-provisioning");
const docHandler = require("./lib/document-handler");

class ManagerClientService extends cds.ApplicationService {
    init() {
        this.on('getToken', (req) => this._getToken(req));

        this.on("uploadProjectDocument", (req) => docHandler.upload(req, this.entities));
        this.on("getProjectDocumentContent", (req) => docHandler.getContent(req));
        this.on('getAppInfo', () => this._getAppInfo());
        this.on('sendTestAlert', (req) => this._sendTestAlert(req));
        this.on("runScheduledHealthCheck", () => this._runScheduledHealthCheck());
        this.on("createUser", (req) => this._createUser(req));
        // Cache READ Clients for 60 seconds by default
        this.on("READ", "Clients", (req, next) => redisCache.readWithCache(req, next, { prefix: "clients" }));
        this.after(["CREATE", "UPDATE", "DELETE"], "Clients", () => redisCache.clearCache("clients"));
        this.on("READ", "Projects", (req, next) => redisCache.readWithCache(req, next, { prefix: "projects", ttlSeconds: 30 }));
        this.after(["CREATE", "UPDATE", "DELETE"], "Projects", () => redisCache.clearCache("projects"));

        return super.init();
    }

    _getToken(req) {
        const token = req._.req.headers.authorization;
        return token || 'No token found';
    }

    _getAppInfo() {
        return "Client Manager CAP backend - CI/CD validation v1";
    }

    async _sendTestAlert(req) {
        const { message } = req.data;
        const wasSent = await alertNotification.sendTestAlert(message);
        return wasSent ? "Alert sent" : "Alert was not sent";
    }

    async _runScheduledHealthCheck() {
        await alertNotification.sendScheduledJobAlert();
        return "Scheduled health check executed";
    }

    async _createUser(req) {
        const { fullName, email, userType, role, clientId } = req.data;

        try {
            const isEnabled = await featureFlags.isFeatureEnabled("enable-ias-user-provisioning", true);

            if (!isEnabled) {
                return req.error(403, "La creación de usuarios IAS está deshabilitada temporalmente.");
            }

            iasProvisioner.validate({ fullName, email, userType, clientId });

            const normalizedEmail = email.trim().toLowerCase();
            const normalizedUserType = userType.trim().toUpperCase();
            const resolvedRole = role?.trim() || "Viewer";

            const iasUser = await iasProvisioner.createInIas({
                fullName,
                email: normalizedEmail,
                iasGroup: "ClientManagerViewer"
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

            return tx.run(SELECT.one.from(Users).where({ ID: userId }));
        } catch (error) {
            console.error("[IAS] Error en creación de usuario:", error);
            return req.error(error.status || 500, error.message || "Error al crear usuario en IAS.");
        }
    }
}

module.exports = ManagerClientService;