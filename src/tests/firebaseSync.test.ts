import { describe, it, expect, beforeEach } from 'vitest';
import { 
  recordLatencyMetric, 
  getLatencySummary, 
  latencyLogs, 
  generateAuditSyncReport 
} from '../lib/firebaseSync';

describe('Firebase & Data Sync Logic Tests', () => {
  beforeEach(() => {
    latencyLogs.length = 0;
  });

  describe('Latency Metrics Recording & Summary', () => {
    it('should calculate accurate latency metrics and averages', () => {
      recordLatencyMetric({
        operation: 'pull',
        collectionName: 'grades',
        durationMs: 100,
        itemCount: 50,
        itemsPerSecond: 500,
        status: 'success'
      });

      recordLatencyMetric({
        operation: 'pull',
        collectionName: 'attendance',
        durationMs: 200,
        itemCount: 50,
        itemsPerSecond: 250,
        status: 'success'
      });

      recordLatencyMetric({
        operation: 'push',
        collectionName: 'students',
        durationMs: 300,
        itemCount: 10,
        itemsPerSecond: 33,
        status: 'success'
      });

      const summary = getLatencySummary();
      expect(summary.totalOperations).toBe(3);
      expect(summary.avgPullDurationMs).toBe(150); // (100 + 200) / 2
      expect(summary.avgPushDurationMs).toBe(300);
      expect(summary.recentMetric?.collectionName).toBe('students');
    });

    it('should cap latency log entries to 50 items', () => {
      for (let i = 0; i < 60; i++) {
        recordLatencyMetric({
          operation: 'query',
          collectionName: 'grades',
          durationMs: 50,
          itemCount: 1,
          itemsPerSecond: 20,
          status: 'success'
        });
      }
      expect(latencyLogs.length).toBe(50);
    });
  });

  describe('generateAuditSyncReport', () => {
    it('should produce a complete structured report object', async () => {
      const report = await generateAuditSyncReport();
      expect(report).toHaveProperty('reportType');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('firebaseConnectionStatus');
      expect(report).toHaveProperty('localCollectionsCount');
      expect(report).toHaveProperty('latencyMetricsSummary');
      expect(report.reportType).toContain('Audit Log');
    });
  });
});
