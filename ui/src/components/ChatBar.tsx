import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { companyChatApi, type ChatResponse } from "../api/company-chat";
import { Button } from "@/components/ui/button";

export function ChatBar({ companyId }: { companyId: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = useMutation<ChatResponse, Error, string>({
    mutationFn: (msg) => companyChatApi.send(companyId, { message: msg }),
    onSuccess: (data) => {
      setMessage("");
      setError(null);
      navigate(`/issues/${data.identifier}`);
    },
    onError: (err) => {
      setError(err.message ?? "Failed to send");
    },
  });

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (trimmed.length === 0 || submit.isPending) return;
    submit.mutate(trimmed);
  };

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Ask the Coordinator…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={submit.isPending}
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        />
        <Button
          variant="default"
          size="sm"
          onClick={handleSubmit}
          disabled={submit.isPending || message.trim().length === 0}
        >
          <Send className="h-4 w-4 mr-1" />
          Send
        </Button>
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      <p className="mt-2 text-xs text-muted-foreground">
        Send a message to the Coordinator. They'll plan a new issue from your message.
      </p>
    </div>
  );
}
