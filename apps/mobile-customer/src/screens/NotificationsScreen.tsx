/**
 * NotificationsScreen — in-app notification center.
 * Sprint 35
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  listNotifications,
  markAllNotificationsRead,
  NotificationRecord,
} from "../api";
import { useAuth } from "../context/AuthContext";

export default function NotificationsScreen(): React.ReactElement {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!token) return;
    try {
      const data = await listNotifications(token);
      setNotifications(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const handleMarkAllRead = async () => {
    if (!token) return;
    await markAllNotificationsRead(token).catch(() => {});
    load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
        <TouchableOpacity onPress={handleMarkAllRead}>
          <Text style={styles.markRead}>Mark all read</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.notification_id}
        renderItem={({ item }) => (
          <View style={[styles.item, !item.read && styles.unread]}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemBody}>{item.body}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No notifications.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heading: { fontSize: 22, fontWeight: "bold" },
  markRead: { color: "#F97316", fontWeight: "600" },
  item: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 12 },
  unread: { backgroundColor: "#FFF7ED" },
  itemTitle: { fontWeight: "bold", fontSize: 15 },
  itemBody: { color: "#374151", marginTop: 2 },
  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 24 },
});
