import { Redis } from "ioredis";

export class AnalyticsService {
  private static redis: Redis;

  public static init(redisClient: Redis) {
    this.redis = redisClient;
  }

  public static async trackMatchmakingTime(durationMs: number) {
    try {
      await this.redis.lpush("peerly:analytics:match_times", durationMs.toString());
      await this.redis.ltrim("peerly:analytics:match_times", 0, 999);
    } catch (e) {
      console.error("[Analytics] Failed to track matchmaking time", e);
    }
  }

  public static async trackSessionDuration(durationMs: number) {
    try {
      await this.redis.lpush("peerly:analytics:session_durations", durationMs.toString());
      await this.redis.ltrim("peerly:analytics:session_durations", 0, 999);
    } catch (e) {
      console.error("[Analytics] Failed to track session duration", e);
    }
  }

  public static async trackICECompletionTime(durationMs: number) {
    try {
      await this.redis.lpush("peerly:analytics:ice_times", durationMs.toString());
      await this.redis.ltrim("peerly:analytics:ice_times", 0, 999);
    } catch (e) {
      console.error("[Analytics] Failed to track ICE completion time", e);
    }
  }

  public static async trackMessageSent() {
    try {
      await this.redis.incr("peerly:analytics:messages_today");
    } catch (e) {
      console.error("[Analytics] Failed to track message sent", e);
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
      console.error("[Analytics] Failed to track connection success", e);
    }
  }

  public static async trackPeakUsers(currentOnline: number) {
    try {
      const currentPeak = Number(await this.redis.get("peerly:analytics:daily_peak_users") || 0);
      if (currentOnline > currentPeak) {
        await this.redis.set("peerly:analytics:daily_peak_users", currentOnline.toString());
      }
    } catch (e) {
      console.error("[Analytics] Failed to track peak users", e);
    }
  }

  public static async trackSkip() {
    try {
      await this.redis.incr("peerly:analytics:skips");
    } catch (e) {
      console.error("[Analytics] Failed to track skip", e);
    }
  }

  public static async trackDisconnectReason(reason: string) {
    try {
      await this.redis.hincrby("peerly:analytics:disconnect_reasons", reason, 1);
    } catch (e) {
      console.error("[Analytics] Failed to track disconnect reason", e);
    }
  }

  public static async getStats() {
    if (!this.redis) return null;

    const success = Number(await this.redis.get("peerly:analytics:conn_success") || 0);
    const failure = Number(await this.redis.get("peerly:analytics:conn_failure") || 0);
    const skips = Number(await this.redis.get("peerly:analytics:skips") || 0);
    const messagesToday = Number(await this.redis.get("peerly:analytics:messages_today") || 0);
    const dailyPeakUsers = Number(await this.redis.get("peerly:analytics:daily_peak_users") || 0);
    const reasons = await this.redis.hgetall("peerly:analytics:disconnect_reasons");

    const matchTimesRaw = await this.redis.lrange("peerly:analytics:match_times", 0, -1);
    const avgMatchTime = matchTimesRaw.length > 0
      ? matchTimesRaw.reduce((sum, val) => sum + Number(val), 0) / matchTimesRaw.length
      : 0;

    const sessionDurationsRaw = await this.redis.lrange("peerly:analytics:session_durations", 0, -1);
    const avgSessionDuration = sessionDurationsRaw.length > 0
      ? sessionDurationsRaw.reduce((sum, val) => sum + Number(val), 0) / sessionDurationsRaw.length
      : 0;

    const iceTimesRaw = await this.redis.lrange("peerly:analytics:ice_times", 0, -1);
    const avgICECompletionTime = iceTimesRaw.length > 0
      ? iceTimesRaw.reduce((sum, val) => sum + Number(val), 0) / iceTimesRaw.length
      : 0;

    return {
      successfulConnections: success,
      failedConnections: failure,
      connectionSuccessRate: success + failure > 0 ? (success / (success + failure)) * 100 : 100,
      averageMatchmakingTimeMs: avgMatchTime,
      averageSessionDurationMs: avgSessionDuration,
      averageICECompletionTimeMs: avgICECompletionTime,
      messagesToday,
      dailyPeakUsers,
      totalSkips: skips,
      disconnectReasons: reasons,
    };
  }
}
