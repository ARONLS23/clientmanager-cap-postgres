const Redis = require("ioredis");
const crypto = require("crypto");

class RedisCache {
    constructor() {
        this._redisClient = null;
    }

    _getCredentials() {
        const vcapServices = JSON.parse(process.env.VCAP_SERVICES || "{}");
        const redisServices = vcapServices["redis-cache"] || [];

        const redisService = redisServices.find(
            (serviceInstance) => serviceInstance.name === "clientmanager-redis-cache"
        );

        if (!redisService) {
            throw new Error("Redis service binding was not found.");
        }

        return redisService.credentials;
    }

    _getClient() {
        if (this._redisClient) {
            return this._redisClient;
        }

        const credentials = this._getCredentials();

        const redisUrl =
            credentials.uri ||
            credentials.url ||
            credentials.connectionString ||
            credentials.redisUri;

        if (redisUrl) {
            this._redisClient = new Redis(redisUrl, {
                tls: redisUrl.startsWith("rediss://") ? {} : undefined,
                lazyConnect: true,
                maxRetriesPerRequest: 2
            });

            return this._redisClient;
        }

        const host = credentials.hostname || credentials.host;
        const port = Number(credentials.port || 6379);
        const password = credentials.password;

        if (!host) {
            throw new Error("Redis host was not found in service credentials.");
        }

        this._redisClient = new Redis({
            host,
            port,
            password,
            tls: credentials.tls || credentials.ssl ? {} : undefined,
            lazyConnect: true,
            maxRetriesPerRequest: 2
        });

        return this._redisClient;
    }

    _buildCacheKey(prefix, req) {
        const queryHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(req.query))
            .digest("hex");

        return `clientmanager:${prefix}:${queryHash}`;
    }

    async readWithCache(req, next, options = {}) {
        const { prefix = "clients", ttlSeconds = 60 } = options;

        const redis = this._getClient();
        const cacheKey = this._buildCacheKey(prefix, req);

        try {
            if (redis.status === "wait") {
                await redis.connect();
            }

            const cachedValue = await redis.get(cacheKey);

            if (cachedValue) {
                console.log("[Redis] Cache hit:", cacheKey);
                return JSON.parse(cachedValue);
            }

            console.log("[Redis] Cache miss:", cacheKey);

            const result = await next();

            await redis.set(cacheKey, JSON.stringify(result), "EX", ttlSeconds);

            return result;
        } catch (error) {
            console.warn("[Redis] Cache error. Falling back to database:", error.message);
            return next();
        }
    }

    async clearCache(prefix = "clients") {
        try {
            const redis = this._getClient();

            if (redis.status === "wait") {
                await redis.connect();
            }

            const keys = await redis.keys(`clientmanager:${prefix}:*`);

            if (!keys.length) {
                console.log("[Redis] No cache keys to clear for prefix:", prefix);
                return;
            }

            await redis.del(keys);

            console.log(`[Redis] Cleared cache keys (${prefix}): ${keys.length}`);
        } catch (error) {
            console.warn("[Redis] Could not clear cache:", error.message);
        }
    }
}

module.exports = new RedisCache();