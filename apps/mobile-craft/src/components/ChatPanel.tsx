/**
 * ChatPanel — in-app messaging (Sprint 66). Polls every 3s.
 * Professional ↔ customer, scoped to a craft request. NOT shared across apps (isolation rule).
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { listRequestMessages, sendRequestMessage, ChatMessage } from "../api";

type Props = { token: string; requestId: string; accent?: string };

export default function ChatPanel({ token, requestId, accent = "#1D4ED8" }: Props): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      listRequestMessages(token, requestId).then((m) => { if (active) setMessages(m); }).catch(() => {});
    load();
    const iv = setInterval(load, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [token, requestId]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await sendRequestMessage(token, requestId, body);
      setMessages((prev) => [...prev, msg]);
      setInput("");
    } catch {
      /* keep the input so the user can retry */
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.header}>💬 Chat</Text>
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && <Text style={styles.empty}>No messages yet.</Text>}
        {messages.map((m) => (
          <View
            key={m.message_id}
            style={[styles.bubble, m.mine
              ? { alignSelf: "flex-end", backgroundColor: accent }
              : { alignSelf: "flex-start", backgroundColor: "#f1f5f9" }]}
          >
            <Text style={{ color: m.mine ? "#fff" : "#111827" }}>{m.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          maxLength={4000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: accent, opacity: sending || !input.trim() ? 0.5 : 1 }]}
          onPress={handleSend}
          disabled={sending || !input.trim()}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" },
  header: { padding: 10, fontWeight: "700", fontSize: 14, backgroundColor: "#f9fafb", color: "#111827" },
  list: { maxHeight: 240, padding: 10 },
  empty: { color: "#9ca3af", fontSize: 13, textAlign: "center" },
  bubble: { maxWidth: "80%", paddingVertical: 7, paddingHorizontal: 11, borderRadius: 14, marginBottom: 6 },
  inputRow: { flexDirection: "row", padding: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb", gap: 6 },
  input: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#cbd5e1", fontSize: 14 },
  sendBtn: { borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" },
  sendText: { color: "#fff", fontWeight: "600" },
});
