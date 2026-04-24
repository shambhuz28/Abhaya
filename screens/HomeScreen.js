import React from 'react';
import {
  Alert,
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

const actionCards = [
  { key: 'scan', icon: 'camera-outline', title: 'Scan', subtitle: 'Number Plate' },
  { key: 'journey', icon: 'map-outline', title: 'Track', subtitle: 'Journey' },
  { key: 'contacts', icon: 'people-outline', title: 'Emergency', subtitle: 'Contacts' },
  { key: 'reports', icon: 'document-text-outline', title: 'Reports', subtitle: '& Evidence' },
];

const navItems = [
  { key: 'Home', icon: 'home', label: 'Home' },
  { key: 'Journey', icon: 'location-outline', label: 'Journey' },
  { key: 'EmergencyContacts', icon: 'people-outline', label: 'Contacts' },
  { key: 'IncidentReport', icon: 'document-text-outline', label: 'Reports' },
  { key: 'Settings', icon: 'settings-outline', label: 'Settings' },
];

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const displayName = user?.displayName || user?.name || 'Priya';
  const avatarLetter = displayName.trim().charAt(0).toUpperCase() || 'P';

  const handleSosPress = () => {
    Alert.alert('SOS Activated', 'Emergency detected. Recording started.', [
      {
        text: 'OK',
        onPress: () =>
          navigation.navigate('IncidentReport', {
            autoStartEvidence: true,
            triggerType: 'SOS',
          }),
      },
    ]);
  };

  const handleActionPress = (key) => {
    if (key === 'contacts') {
      navigation.navigate('EmergencyContacts');
      return;
    }

    if (key === 'reports') {
      navigation.navigate('IncidentReport');
      return;
    }

    Alert.alert('Coming Soon', 'This feature is part of the frontend layout and can be wired next.');
  };

  const handleNavPress = (key) => {
    if (key === 'Home') {
      return;
    }

    if (key === 'EmergencyContacts' || key === 'IncidentReport' || key === 'Settings') {
      navigation.navigate(key);
      return;
    }

    Alert.alert('Coming Soon', 'This section is not wired yet.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f3ff" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hi {displayName.split(' ')[0]} 👋</Text>
            <Text style={styles.subGreeting}>Stay Safe Today</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.bellButton} activeOpacity={0.85}>
              <Ionicons name="notifications-outline" size={22} color="#1f1f1f" />
              <View style={styles.notificationDot} />
            </TouchableOpacity>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location" size={14} color="#ff5d4d" />
            <Text style={styles.metaText}>Nagpur, Maharashtra</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="cloud-outline" size={14} color="#7b57d1" />
            <Text style={styles.metaText}>23°C</Text>
          </View>
        </View>

        <View style={styles.safetyCard}>
          <View style={styles.safetyHeader}>
            <View style={styles.safeTitleWrap}>
              <View style={styles.safeDot} />
              <Text style={styles.safetyTitle}>You are Safe</Text>
            </View>

            <View style={styles.darkChip}>
              <Ionicons name="moon" size={12} color="#f8d664" />
              <Text style={styles.darkChipText}>Dark</Text>
            </View>
          </View>

          <View style={styles.safetyBody}>
            <View style={styles.riskRing}>
              <Text style={styles.riskValue}>15%</Text>
              <Text style={styles.riskLabel}>Risk</Text>
            </View>

            <View style={styles.riskDetails}>
              <Text style={styles.riskHeading}>Risk Indicators</Text>
              <View style={styles.riskBulletRow}>
                <View style={styles.riskBullet} />
                <Text style={styles.riskBulletText}>Location: Safe</Text>
              </View>
              <View style={styles.riskBulletRow}>
                <View style={styles.riskBullet} />
                <Text style={styles.riskBulletText}>Time: Day</Text>
              </View>
              <View style={styles.riskBulletRow}>
                <View style={styles.riskBullet} />
                <Text style={styles.riskBulletText}>Activity: Normal</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          {actionCards.map((card) => (
            <TouchableOpacity
              key={card.key}
              activeOpacity={0.88}
              style={styles.actionCard}
              onPress={() => handleActionPress(card.key)}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons name={card.icon} size={24} color="#7b57d1" />
              </View>
              <Text style={styles.actionTitle}>{card.title}</Text>
              <Text style={styles.actionSubtitle}>{card.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.sosWrap}
          onPress={handleSosPress}
        >
          <View style={styles.sosButton}>
            <Ionicons name="alert-circle-outline" size={52} color="#fff" />
            <Text style={styles.sosText}>SOS</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sosHint}>Tap SOS to activate emergency</Text>

        <View style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>Recent Activity</Text>
            <Ionicons name="time-outline" size={16} color="#9d9d9d" />
          </View>
          <Text style={styles.activityText}>
            No recent journeys today. Start tracking to see activity.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        {navItems.map((item) => {
          const active = item.key === 'Home';

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.85}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => handleNavPress(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? '#6e44cf' : '#7f7f7f'}
              />
              <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f3ff',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 130,
  },
  headerRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  subGreeting: {
    marginTop: 6,
    fontSize: 15,
    color: '#8f8f96',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 6,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff5d4d',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#8c63db',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8c63db',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  metaRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#515463',
    fontWeight: '500',
  },
  safetyCard: {
    marginTop: 26,
    borderRadius: 26,
    backgroundColor: '#8a5ce4',
    padding: 20,
    shadowColor: '#8a5ce4',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },
  safetyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  safeTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  safeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#49d160',
  },
  safetyTitle: {
    color: '#fff',
    fontSize: width < 380 ? 18 : 20,
    fontWeight: '800',
  },
  darkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  darkChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  safetyBody: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  riskRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 8,
    borderColor: '#49d160',
    borderRightColor: 'rgba(255,255,255,0.18)',
    borderBottomColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  riskLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    marginTop: 2,
  },
  riskDetails: {
    flex: 1,
  },
  riskHeading: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  riskBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 9,
  },
  riskBullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#49d160',
  },
  riskBulletText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    fontWeight: '500',
  },
  grid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  actionCard: {
    width: (width - 62) / 2,
    minHeight: 110,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: '#14092c',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#f1e9ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#26242d',
  },
  actionSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#9997a3',
    fontWeight: '500',
  },
  sosWrap: {
    alignSelf: 'center',
    marginTop: 26,
  },
  sosButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#f13a35',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f13a35',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 9,
  },
  sosText: {
    marginTop: 6,
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  sosHint: {
    marginTop: 14,
    textAlign: 'center',
    color: '#9b99a4',
    fontSize: 12,
    fontWeight: '500',
  },
  activityCard: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#14092c',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.07,
    shadowRadius: 24,
    elevation: 4,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#34313c',
  },
  activityText: {
    marginTop: 12,
    color: '#9a97a2',
    fontSize: 13,
    lineHeight: 18,
  },
  bottomNav: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#14092c',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 9,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 18,
  },
  navItemActive: {
    backgroundColor: '#f2ebff',
  },
  navText: {
    marginTop: 6,
    fontSize: 11,
    color: '#7f7f7f',
    fontWeight: '500',
  },
  navTextActive: {
    color: '#6e44cf',
    fontWeight: '700',
  },
});
