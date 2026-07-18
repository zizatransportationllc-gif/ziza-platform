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
  deleteNotification,
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

  const handleDelete = async (id: string) => {
    if (!token) return;
    const prev = notifications;
    setNotifications((cur) => cur.filter((n) => n.notification_id !== id)); // optimistic
    try {
      await deleteNotification(token, id);
    } catch {
      setNotifications(prev); // restore on failure
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
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
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBody}>{item.body}</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleDelete(item.notification_id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.deleteBtn}>✕</Text>
            </TouchableOpacity>
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
  markRead: { color: "#1D4ED8", fontWeight: "600" },
  item: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  itemContent: { flex: 1 },
  unread: { backgroundColor: "#EEF3FE" },
  itemTitle: { fontWeight: "bold", fontSize: 15 },
  itemBody: { color: "#374151", marginTop: 2 },
  deleteBtn: { color: "#9CA3AF", fontSize: 18, paddingHorizontal: 8 },
  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 24 },
});
