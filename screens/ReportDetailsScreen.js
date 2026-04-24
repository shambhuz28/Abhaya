import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReport } from '../context/ReportContext';
import { getIncidentReportById, getLatestIncidentReport } from '../services/reportStorage';

const formatTimestamp = (isoString) => {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  } catch {
    return '';
  }
};

export default function ReportDetailsScreen({ navigation, route }) {
  const passedReport = route?.params?.report || null;
  const passedIncidentId = route?.params?.incidentId || passedReport?.incidentId || '';

  const { latestReport, setLatestReport } = useReport();

  const initialReport = useMemo(() => {
    if (passedReport) return passedReport;
    if (passedIncidentId && latestReport?.incidentId === passedIncidentId) return latestReport;
    return latestReport || null;
  }, [passedReport, passedIncidentId, latestReport]);

  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(!initialReport);
  const [error, setError] = useState('');

  const incidentId = report?.incidentId || passedIncidentId || '';

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      if (passedIncidentId) {
        const stored = await getIncidentReportById(passedIncidentId);
        const nextReport = stored?.data || null;
        if (!nextReport) {
          throw new Error('Report not found yet. Trigger SOS to generate a report.');
        }
        setReport(nextReport);
        await setLatestReport(nextReport);
        return;
      }

      const latest = await getLatestIncidentReport();
      const nextReport = latest?.data || latestReport || null;
      if (!nextReport) {
        throw new Error('No report found yet. Trigger SOS to generate one.');
      }

      setReport(nextReport);
      await setLatestReport(nextReport);
    } catch (e) {
      setError(e?.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [passedIncidentId, latestReport, setLatestReport]);

  useEffect(() => {
    if (!report) {
      loadReport();
    } else if (passedIncidentId && report?.incidentId !== passedIncidentId) {
      loadReport();
    }
  }, [report, passedIncidentId, loadReport]);

  const openVideo = () => {
    const hasVideos = Array.isArray(report?.evidence)
      ? report.evidence.some((item) => item?.type === 'video' && item?.url)
      : false;
    if (!hasVideos) return;
    navigation.navigate('VideoEvidence', { incidentId });
  };

  const headerSubtitle = useMemo(() => {
    if (!incidentId) return '';
    return `Incident: ${incidentId.slice(0, 8)}…`;
  }, [incidentId]);

  const timelineItems = useMemo(() => {
    const timeline = Array.isArray(report?.timeline) ? report.timeline : [];
    return timeline.map((label, index) => ({ key: `${index}-${label}`, label }));
  }, [report]);

  const videoEvidenceCount = useMemo(() => {
    if (!Array.isArray(report?.evidence)) return 0;
    return report.evidence.filter((item) => item?.type === 'video' && item?.url).length;
  }, [report]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fbf9ff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Report Details</Text>
          {headerSubtitle ? <Text style={styles.headerSubtitle}>{headerSubtitle}</Text> : null}
        </View>
        <TouchableOpacity onPress={loadReport} style={styles.refreshButton} activeOpacity={0.8}>
          <Ionicons name="refresh" size={20} color="#7b57d1" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7b57d1" />
          <Text style={styles.centerText}>Loading report…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={24} color="#ea5455" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !report ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>No report available.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCirclePurple}>
                <Ionicons name="document-text-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Basic Info</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Incident ID</Text>
              <Text style={styles.value}>{report.incidentId || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Timestamp</Text>
              <Text style={styles.value}>{formatTimestamp(report.createdAt) || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{report.status || 'ACTIVE'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircleBlue}>
                <Ionicons name="person-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>User</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{report.user?.name || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.value}>{report.user?.phone || '-'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircleRed}>
                <Ionicons name="flash-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Trigger</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Type</Text>
              <Text style={styles.value}>{report.trigger?.type || 'MANUAL'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Risk Score</Text>
              <Text style={styles.value}>{report.trigger?.riskScore || 'HIGH'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircleOrange}>
                <Ionicons name="location-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Location</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Latitude</Text>
              <Text style={styles.value}>{String(report.location?.lat ?? '-')}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Longitude</Text>
              <Text style={styles.value}>{String(report.location?.lng ?? '-')}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Address</Text>
              <Text style={styles.value}>{report.location?.address || '-'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircleGreen}>
                <Ionicons name="time-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Timeline</Text>
            </View>
            {timelineItems.length === 0 ? (
              <Text style={styles.centerText}>No timeline available.</Text>
            ) : timelineItems.map((item) => (
              <View key={item.key} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineLabel}>{item.label}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircleGold}>
                <Ionicons name="folder-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Evidence</Text>
            </View>

            <View style={styles.evidenceRow}>
              <View style={styles.evidenceIconWrap}>
                <Ionicons name="videocam-outline" size={18} color="#7b57d1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.evidenceTitle}>Video Evidence</Text>
                <Text style={styles.evidenceMeta}>
                  {videoEvidenceCount > 0 ? `${videoEvidenceCount} video(s) available` : 'No video evidence yet'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={openVideo}
                activeOpacity={0.85}
                disabled={videoEvidenceCount === 0}
                style={[
                  styles.viewButton,
                  videoEvidenceCount === 0 && styles.viewButtonDisabled,
                ]}
              >
                <Text style={styles.viewButtonText}>View Video Evidence</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fbf9ff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: { padding: 4 },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2ebff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginLeft: 12, marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: '#8f8f96', fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  centerText: { color: '#8f8f96', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  errorText: { color: '#ea5455', fontSize: 13, fontWeight: '700', textAlign: 'center' },

  content: { paddingHorizontal: 20, paddingBottom: 30 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#14092c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111' },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#8f8f96' },
  value: { fontSize: 13, fontWeight: '800', color: '#111', marginLeft: 14, flexShrink: 1, textAlign: 'right' },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e9fbef',
  },
  statusText: { fontSize: 12, fontWeight: '900', color: '#1f9d55' },

  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7b57d1', marginTop: 4 },
  timelineText: { flex: 1 },
  timelineLabel: { fontSize: 13, fontWeight: '800', color: '#111' },
  timelineValue: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#8f8f96' },

  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  evidenceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2ebff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceTitle: { fontSize: 13, fontWeight: '900', color: '#111' },
  evidenceMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#8f8f96' },

  viewButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#7b57d1',
  },
  viewButtonDisabled: { backgroundColor: '#d8cff0' },
  viewButtonText: { fontSize: 12, fontWeight: '900', color: '#fff' },

  iconCirclePurple: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7b57d1', alignItems: 'center', justifyContent: 'center' },
  iconCircleBlue: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#4da6ff', alignItems: 'center', justifyContent: 'center' },
  iconCircleRed: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ea5455', alignItems: 'center', justifyContent: 'center' },
  iconCircleOrange: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ff9f43', alignItems: 'center', justifyContent: 'center' },
  iconCircleGreen: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2ecc71', alignItems: 'center', justifyContent: 'center' },
  iconCircleGold: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f8d664', alignItems: 'center', justifyContent: 'center' },
});
