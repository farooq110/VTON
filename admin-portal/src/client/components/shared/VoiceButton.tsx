import { useEffect, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { cn } from "@/client/lib/utils";

interface VoiceButtonProps {
  onTranscript?: (text: string) => void;
  className?: string;
  /** When true, the button is hidden (e.g. no SpeechRecognition support). */
  hidden?: boolean;
}

/**
 * Loose wrapper around the browser's SpeechRecognition API. If unavailable
 * the button renders but is disabled.
 */
export function VoiceButton({
  onTranscript,
  className,
  hidden,
}: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  // Ref-like holder for the active recognition instance.
  const [recognition, setRecognition] =
    useState<null | { stop: () => void; abort: () => void }>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    return () => {
      recognition?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start() {
    if (!supported) return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const text = ev.results?.[0]?.[0]?.transcript ?? "";
      onTranscript?.(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setRecognition(rec);
    setListening(true);
  }

  function stop() {
    recognition?.stop();
    setListening(false);
  }

  if (hidden) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={!supported}
      onClick={listening ? stop : start}
      className={cn(className)}
      title={supported ? "Voice input" : "Speech recognition not supported"}
      aria-pressed={listening}
    >
      {listening ? (
        <Square className="h-4 w-4 text-destructive" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
