import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Video, ArrowLeft, Users, MessageSquare, Paperclip, CreditCard,
  FileSignature, Brain, User, Maximize2, Copy, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { DealRoomControls } from "./DealRoomControls";
import { DealRoomChat } from "./DealRoomChat";
import { DealRoomAttachments } from "./DealRoomAttachments";
import { DealRoomPayments } from "./DealRoomPayments";
import { DealRoomSignature } from "./DealRoomSignature";
import { DealRoomAIAssistant } from "./DealRoomAIAssistant";
import { DealRoomClientInfo } from "./DealRoomClientInfo";

interface DealRoomMeetingProps {
  tenantId: string;
  sessionId: string;
  roomName: string;
  clientName?: string;
  clientId?: string;
  proposalId?: string;
  proposalValue?: number;
  userId?: string;
  onClose: () => void;
}

export function DealRoomMeeting({
  tenantId, sessionId, roomName, clientName, clientId,
  proposalId, proposalValue, userId, onClose,
}: DealRoomMeetingProps) {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePanel, setActivePanel] = useState<string>("chat");
  const [showClientInfo, setShowClientInfo] = useState(false);

  const clientLink = `${window.location.origin}/sala/${sessionId}`;

  const initJitsi = useCallback(() => {
    if (!jitsiContainerRef.current) return;

    // Load Jitsi external API script
    const existingScript = document.getElementById("jitsi-api-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "jitsi-api-script";
      script.src = "https://meet.jit.si/external_api.js";
      script.async = true;
      script.onload = () => createJitsiMeeting();
      document.head.appendChild(script);
    } else {
      createJitsiMeeting();
    }
  }, [roomName]);

  const createJitsiMeeting = () => {
    if (!jitsiContainerRef.current || !(window as any).JitsiMeetExternalAPI) return;
    
    // Clean up previous instance
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
    }

    const api = new (window as any).JitsiMeetExternalAPI("meet.jit.si", {
      roomName: `orcamovelpro-${roomName}`,
      parentNode: jitsiContainerRef.current,
      width: "100%",
      height: "100%",
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        toolbarButtons: [],
        hideConferenceSubject: true,
        hideConferenceTimer: false,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [],
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        FILM_STRIP_MAX_HEIGHT: 100,
      },
      userInfo: {
        displayName: "Projetista",
      },
    });

    jitsiApiRef.current = api;
  };

  useEffect(() => {
    initJitsi();
    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [initJitsi]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(clientLink);
    toast.success("Link copiado!");
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

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Sair
          </Button>
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Deal Room</span>
            {clientName && (
              <Badge variant="secondary" className="text-xs">{clientName}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowClientInfo(true)} className="gap-1 text-xs">
            <User className="h-3.5 w-3.5" /> Dados Cliente
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1 text-xs">
            <Copy className="h-3.5 w-3.5" /> Copiar Link
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(clientLink, "_blank")} className="gap-1 text-xs">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir Link
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex flex-col bg-black relative">
          <div ref={jitsiContainerRef} className="flex-1 min-h-0" />
          <DealRoomControls
            jitsiApi={jitsiApiRef.current}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
          />
        </div>

        {/* Side panel */}
        <div className="w-[380px] border-l flex flex-col bg-card">
          <Tabs value={activePanel} onValueChange={setActivePanel} className="flex flex-col flex-1">
            <TabsList className="w-full justify-start rounded-none border-b px-2 bg-muted/30 overflow-x-auto flex-shrink-0">
              <TabsTrigger value="chat" className="gap-1 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Chat</TabsTrigger>
              <TabsTrigger value="ai" className="gap-1 text-xs"><Brain className="h-3.5 w-3.5" /> IA</TabsTrigger>
              <TabsTrigger value="anexos" className="gap-1 text-xs"><Paperclip className="h-3.5 w-3.5" /> Anexos</TabsTrigger>
              <TabsTrigger value="pagamento" className="gap-1 text-xs"><CreditCard className="h-3.5 w-3.5" /> Pagar</TabsTrigger>
              <TabsTrigger value="assinatura" className="gap-1 text-xs"><FileSignature className="h-3.5 w-3.5" /> Assinar</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="chat" className="m-0 p-0 h-full">
                <DealRoomChat sessionId={sessionId} tenantId={tenantId} userId={userId} />
              </TabsContent>
              <TabsContent value="ai" className="m-0 p-3">
                <DealRoomAIAssistant
                  tenantId={tenantId}
                  clientName={clientName}
                  proposalValue={proposalValue}
                />
              </TabsContent>
              <TabsContent value="anexos" className="m-0 p-3">
                <DealRoomAttachments sessionId={sessionId} tenantId={tenantId} />
              </TabsContent>
              <TabsContent value="pagamento" className="m-0 p-3">
                <DealRoomPayments
                  tenantId={tenantId}
                  proposalId={proposalId}
                  proposalValue={proposalValue}
                  clientName={clientName}
                />
              </TabsContent>
              <TabsContent value="assinatura" className="m-0 p-3">
                <DealRoomSignature
                  tenantId={tenantId}
                  sessionId={sessionId}
                  clientName={clientName}
                  proposalValue={proposalValue}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Client Info Dialog */}
      {showClientInfo && clientId && (
        <DealRoomClientInfo
          clientId={clientId}
          tenantId={tenantId}
          onClose={() => setShowClientInfo(false)}
        />
      )}
    </div>
  );
}
