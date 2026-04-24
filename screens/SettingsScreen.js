import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function SettingsScreen({ navigation }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => await logout() },
    ]);
  };

  const renderItem = (icon, iconColor, title, subtitle, rightElement, onPress) => (
    <TouchableOpacity
      style={styles.item}
      activeOpacity={0.7}
      disabled={!!rightElement && !onPress}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={styles.itemTitle}>{title}</Text>
        {subtitle && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={20} color="#ccc" />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fbf9ff" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Placeholder header card */}
        <View style={styles.headerCard} />

        <Text style={styles.sectionHeading}>Account</Text>
        <View style={styles.card}>
          {renderItem('person-outline', '#8c63db', 'Profile Information')}
          <View style={styles.divider} />
          {renderItem(
            'time-outline',
            '#8c63db',
            'Journey History',
            'Recent routes and safety logs',
            null,
            () => navigation.navigate('JourneyHistory')
          )}
          <View style={styles.divider} />
          {renderItem('people-outline', '#8c63db', 'Emergency Contacts')}
          <View style={styles.divider} />
          {renderItem('lock-closed-outline', '#8c63db', 'Safety Password')}
        </View>

        <Text style={styles.sectionHeading}>Preferences</Text>
        <View style={styles.card}>
          {renderItem('notifications-outline', '#8c63db', 'Notifications', null, (
            <Switch value={true} trackColor={{ true: '#8c63db', false: '#e0e0e0' }} />
          ))}
          <View style={styles.divider} />
          {renderItem('moon-outline', '#8c63db', 'Dark Mode', null, (
            <Switch value={false} trackColor={{ true: '#8c63db', false: '#e0e0e0' }} />
          ))}
        </View>

        <Text style={styles.sectionHeading}>Journey Settings</Text>
        <View style={styles.card}>
          {renderItem('location-outline', '#8c63db', 'Idle Threshold', '5 minutes')}
          <View style={styles.divider} />
          {renderItem('notifications-circle-outline', '#8c63db', 'Auto SOS Sensitivity', 'Medium')}
          <View style={styles.divider} />
          {renderItem('mic-outline', '#8c63db', 'Audio Monitoring', null, (
            <Switch value={true} trackColor={{ true: '#8c63db', false: '#e0e0e0' }} />
          ))}
        </View>

        <Text style={styles.sectionHeading}>Vehicle Safety</Text>
        <View style={styles.card}>
          {renderItem(
            'camera-outline',
            '#8c63db',
            'No Plate Vehicle Scan',
            'Scan, upload, and save to Firebase',
            null,
            () => navigation.navigate('VehicleScan')
          )}
        </View>

        <Text style={styles.sectionHeading}>About</Text>
        <View style={styles.card}>
          {renderItem('information-circle-outline', '#8c63db', 'About Abhaya', 'Version 1.0.0')}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ea5455" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fbf9ff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  
  headerCard: { backgroundColor: '#fff', borderRadius: 20, height: 100, marginBottom: 24, marginTop: 8, shadowColor: '#14092c', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 3 },
  
  sectionHeading: { fontSize: 13, fontWeight: '700', color: '#8f8f96', marginLeft: 4, marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 24, shadowColor: '#14092c', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.03, shadowRadius: 12, elevation: 2 },
  
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  itemTextWrap: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  itemSubtitle: { fontSize: 12, color: '#8f8f96', marginTop: 2 },
  
  divider: { height: 1, backgroundColor: '#f2f2f2', marginLeft: 50 },
  
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#ffeaea', shadowColor: '#ea5455', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginTop: 10 },
  logoutText: { color: '#ea5455', fontSize: 15, fontWeight: '700' },
});
