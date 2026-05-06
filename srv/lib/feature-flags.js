class FeatureFlagsClient {
    _getCredentials() {
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

    async isFeatureEnabled(featureName, defaultValue = true) {
        try {
            const credentials = this._getCredentials();

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

module.exports = new FeatureFlagsClient();