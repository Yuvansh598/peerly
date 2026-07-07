import { Redis } from "ioredis";

export class AnalyticsService {
  private static redis: Redis;

  public static init(redisClient: Redis) {
    this.redis = redisClient;
  }

  public static async trackMatchmakingTime(durationMs: number) {
    try {
      await this.redis.lpush("peerly:analytics:match_times", durationMs.toString());
      await this.redis.ltrim("peerly:analytics:match_times", 0, 999); // Keep last 1000 matches
    } catch (e) {
      console.error("Failed to track matchmaking time", e);
    }
  }

  public static async trackConnectionSuccess(success: boolean) {
    try {
      if (success) {
        await this.redis.incr("peerly:analytics:conn_success");
      } else {
        await this.redis.incr("peerly:analytics:conn_failure");
      }
    } catch (e) {
      console.error("Failed to track connection success", e);
    }
  }

  public static async trackSkip() {
    try {
      await this.redis.incr("peerly:analytics:skips");
    } catch (e) {
      console.error("Failed to track skip", e);
    }
  }

  public static async trackDisconnectReason(reason: string) {
    try {
      await this.redis.hincrby("peerly:analytics:disconnect_reasons", reason, 1);
    } catch (e) {
      console.error("Failed to track disconnect reason", e);
    }
  }

  public static async getStats() {
    if (!this.redis) return null;
    const success = Number(await this.redis.get("peerly:analytics:conn_success") || 0);
    const failure = Number(await this.redis.get("peerly:analytics:conn_failure") || 0);
    const skips = Number(await this.redis.get("peerly:analytics:skips") || 0);
    const reasons = await this.redis.hgetall("peerly:analytics:disconnect_reasons");
    const matchTimesRaw = await this.redis.lrange("peerly:analytics:match_times", 0, -1);
    
    const avgMatchTime = matchTimesRaw.length > 0 
      ? matchTimesRaw.reduce((sum, val) => sum + Number(val), 0) / matchTimesRaw.length
      : 0;

    return {
      connectionSuccessRate: success + failure > 0 ? (success / (success + failure)) * 100 : 100,
      averageMatchmakingTimeMs: avgMatchTime,
      totalSkips: skips,
      disconnectReasons: reasons
    };
  }
}
