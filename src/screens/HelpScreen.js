/**
 * ============================================================
 *  AirSnap — HelpScreen (Help & Support)
 * ============================================================
 *  Accessible from:
 *    • Profile → Help & Support link (with back button)
 *
 *  Features:
 *    1. FAQ accordion — common questions with expandable answers
 *    2. Contact options (email, phone icons)
 *    3. Technical live-chat simulator (simple message UI)
 *
 *  The chat is entirely local; in production it would connect
 *  to a support tool like Zendesk / Intercom.
 * ============================================================
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';

// ── FAQ data ──────────────────────────────────────────────
const FAQ = [
  {
    q: 'How does drone ordering work?',
    a: 'Simply pick a location on the home screen, select a photography package, and confirm payment. A drone will be dispatched to your location automatically.',
  },
  {
    q: 'What areas are covered?',
    a: 'AirSnap currently operates within partner tourist sites and urban parks. Check the "Pick a Location" list for pre-mapped locations.',
  },
  {
    q: 'How long until I receive my content?',
    a: 'Content is processed in under 2 minutes after the session ends and delivered straight to the app gallery.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'You can cancel before the drone departs. Once in flight, partial charges may apply. Contact support for assistance.',
  },
  {
    q: 'Is my payment secure?',
    a: 'Yes — all transactions are encrypted end-to-end. We support Apple Pay, Google Pay, credit cards, and PayPal.',
  },
];

// ── Auto-replies for the chat simulator ──────────────────
const BOT_REPLIES = [
  'Thanks for reaching out! A support agent will be with you shortly.',
  'In the meantime, have you checked our FAQ section above?',
  'We typically respond within a few minutes.',
];

export default function HelpScreen({ navigation }) {
  // ── FAQ expand state ──────────────────────────────────
  const [expandedIdx, setExpandedIdx] = useState(null);

  // ── Chat state ────────────────────────────────────────
  const [messages, setMessages] = useState([
    { id: '0', text: 'Hi! 👋 How can we help you today?', from: 'bot' },
  ]);
  const [input, setInput] = useState('');
  const listRef = useRef(null);
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  // ── Send message handler ──────────────────────────────
  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg = { id: Date.now().toString(), text: trimmed, from: 'user' };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Bot auto-reply after a short delay
    setTimeout(() => {
      const replyText = BOT_REPLIES[messages.length % BOT_REPLIES.length];
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: replyText, from: 'bot' },
      ]);
    }, 1200);
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <ScreenWrapper
      title="Help & Support"
      onBack={() => navigation.goBack()}
      scroll
    >
      {/* ─── FAQ Section ─────────────────────────────────── */}
      <Text style={[Typography.label, styles.sectionTitle, { color: colors.textSecondary }]}>
        Frequently Asked Questions
      </Text>

      {FAQ.map((item, idx) => {
        const isOpen = expandedIdx === idx;
        return (
          <Card key={idx} style={styles.faqCard}>
            <TouchableOpacity
              style={styles.faqHeader}
              onPress={() => setExpandedIdx(isOpen ? null : idx)}
              activeOpacity={0.8}
            >
              <Text style={[Typography.bodySemibold, { flex: 1, color: colors.textPrimary }]}>{item.q}</Text>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
            {isOpen && (
              <Text style={[Typography.bodySmall, styles.faqAnswer, { color: colors.textSecondary }]}>
                {item.a}
              </Text>
            )}
          </Card>
        );
      })}

      {/* ─── Contact options ─────────────────────────────── */}
      <Text style={[Typography.label, styles.sectionTitle, { color: colors.textSecondary }]}>Contact Us</Text>
      <View style={styles.contactRow}>
        <Card style={styles.contactCard}>
          <Ionicons name="mail" size={28} color={colors.primary} />
          <Text style={[Typography.bodySmall, { marginTop: 6, color: colors.textSecondary }]}>Email</Text>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>support@airsnap.io</Text>
        </Card>
        <Card style={styles.contactCard}>
          <Ionicons name="call" size={28} color={colors.accent} />
          <Text style={[Typography.bodySmall, { marginTop: 6, color: colors.textSecondary }]}>Phone</Text>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>1-800-AIRSNAP</Text>
        </Card>
      </View>

      {/* ─── Live Chat Section ───────────────────────────── */}
      <Text style={[Typography.label, styles.sectionTitle, { color: colors.textSecondary }]}>Technical Chat</Text>

      <Card style={styles.chatCard}>
        {/* Messages list */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.messageList}
          renderItem={({ item: msg }) => (
            <View
              style={[
                styles.bubble,
                msg.from === 'user' ? styles.bubbleUser : styles.bubbleBot,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  msg.from === 'user' && styles.bubbleTextUser,
                ]}
              >
                {msg.text}
              </Text>
            </View>
          )}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* Input row */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Type a message…"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Ionicons name="send" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Card>
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  sectionTitle: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // ── FAQ ─────────────────────────────────────────────────
  faqCard: {
    marginBottom: Spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faqAnswer: {
    marginTop: Spacing.sm,
    lineHeight: 22,
  },

  // ── Contact ─────────────────────────────────────────────
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contactCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginHorizontal: 4,
  },

  // ── Chat ────────────────────────────────────────────────
  chatCard: {
    marginBottom: Spacing.xl,
    padding: 0,
    overflow: 'hidden',
  },
  messageList: {
    maxHeight: 250,
    padding: Spacing.md,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Spacing.radiusMd,
    marginBottom: Spacing.sm,
  },
  bubbleBot: {
    backgroundColor: colors.bgCardLight,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: colors.white,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: Spacing.radiusMd,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
});
