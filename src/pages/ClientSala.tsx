import { useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Video, Send, Paperclip, Upload, Download, Eye, Mic, MicOff,
  VideoIcon, VideoOff, PhoneOff, Maximize2, Minimize2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function ClientSala() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Load chat messages
    const loadMessages = async () => {
      const { data } = await supabase
        .from("dealroom_chat_messages" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    loadMessages();

    // Realtime
    const channel = supabase
      .channel(`client-chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dealroom_chat_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    // Init Jitsi
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => {
      if (!jitsiContainerRef.current || !(window as any).JitsiMeetExternalAPI) return;
      const roomName = `orcamovelpro-${sessionId?.replace(/-/g, "").slice(0, 16)}`;
      const api = new (window as any).JitsiMeetExternalAPI("meet.jit.si", {
        roomName,
        parentNode: jitsiContainerRef.current,
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          toolbarButtons: [],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          TOOLBAR_BUTTONS: [],
        },
        userInfo: { displayName: "Cliente" },
      });
      jitsiApiRef.current = api;
    };
    document.head.appendChild(script);

    return () => {
      supabase.removeChannel(channel);
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
      }
    };
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;
    await supabase.from("dealroom_chat_messages" as any).insert({
      session_id: sessionId,
      sender: "cliente",
      message: input.trim(),
    });
    setInput("");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Link de sala inválido.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Sala de Reunião</span>
          <Badge variant="secondary" className="text-xs">Convidado</Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video */}
        <div className="flex-1 flex flex-col bg-black relative">
          <div ref={jitsiContainerRef} className="flex-1 min-h-0" />
          <div className="flex items-center justify-center gap-3 py-3 px-4 bg-card/90 backdrop-blur border-t">
            <Button variant={muted ? "destructive" : "secondary"} size="icon"
              onClick={() => { jitsiApiRef.current?.executeCommand("toggleAudio"); setMuted(!muted); }}>
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button variant={videoOff ? "destructive" : "secondary"} size="icon"
              onClick={() => { jitsiApiRef.current?.executeCommand("toggleVideo"); setVideoOff(!videoOff); }}>
              {videoOff ? <VideoOff className="h-4 w-4" /> : <VideoIcon className="h-4 w-4" />}
            </Button>
            <Button variant="secondary" size="icon" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="destructive" size="icon"
              onClick={() => { jitsiApiRef.current?.executeCommand("hangup"); }}>
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chat */}
        <div className="w-[320px] border-l flex flex-col bg-card">
          <div className="px-3 py-2 border-b">
            <h4 className="text-sm font-semibold text-foreground">Chat</h4>
          </div>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {messages.map((msg: any) => (
                <div key={msg.id} className={`flex ${msg.sender === "cliente" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.sender === "cliente"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    <p className="text-[10px] font-medium opacity-70 mb-0.5">
                      {msg.sender === "cliente" ? "Você" : "Projetista"}
                    </p>
                    <p>{msg.message}</p>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
          <div className="flex gap-2 p-3 border-t">
            <Input
              placeholder="Mensagem..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              className="h-9 text-sm"
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
