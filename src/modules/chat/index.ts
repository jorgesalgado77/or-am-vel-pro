/**
 * Chat Module — VendaZap, live chat, auto-pilot
 */

// Components
export { VendaZapPanel } from "@/components/VendaZapPanel";
export { MessagesPanel } from "@/components/MessagesPanel";

// Sub-components
export { VendaZapChat } from "@/components/chat/VendaZapChat";
export { ChatWindow } from "@/components/chat/ChatWindow";
export { ChatConversationList } from "@/components/chat/ChatConversationList";
export { ChatInput } from "@/components/chat/ChatInput";
export { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
export { ChatAISuggestion } from "@/components/chat/ChatAISuggestion";
export { AutoPilotPanel } from "@/components/chat/AutoPilotPanel";
export { AutoPilotHistory } from "@/components/chat/AutoPilotHistory";
export { AutoPilotAnalytics } from "@/components/chat/AutoPilotAnalytics";
export { FollowUpPanel } from "@/components/chat/FollowUpPanel";
export { VendaZapGenerateTab } from "@/components/vendazap/VendaZapGenerateTab";

// Hooks
export { useAutoPilot } from "@/hooks/useAutoPilot";
export { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
export { useQuickReplies } from "@/hooks/useQuickReplies";
export { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
export { useTypingIndicator } from "@/hooks/useTypingIndicator";
export { useVendaZap } from "@/hooks/useVendaZap";
export { useVendaZapTriggers } from "@/hooks/useVendaZapTriggers";
