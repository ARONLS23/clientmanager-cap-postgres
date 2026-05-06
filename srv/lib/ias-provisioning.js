class IasProvisioning {
    _getCredentials() {
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

    _getHeaders() {
        const { clientId, clientSecret } = this._getCredentials();

        const auth = Buffer
            .from(`${clientId}:${clientSecret}`)
            .toString("base64");

        return {
            "Content-Type": "application/scim+json",
            "Accept": "application/scim+json",
            "Authorization": `Basic ${auth}`
        };
    }

    _buildUserPayload({ fullName, email, iasGroup }) {
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

    validate({ fullName, email, userType, clientId }) {
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

    async createInIas({ fullName, email, iasGroup }) {
        const { baseUrl } = this._getCredentials();
        const userPayload = this._buildUserPayload({ fullName, email, iasGroup });
        const headers = this._getHeaders();

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
}

module.exports = new IasProvisioning();