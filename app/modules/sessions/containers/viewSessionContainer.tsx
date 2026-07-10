import { useEffect, useState } from "react";
import ViewSession from "../components/viewSession";
import type { Session, Utterance } from "../sessions.types";

export default function ViewSessionContainer({
  session,
}: {
  session: Session;
}) {
  const [transcript, setTranscript] = useState<Utterance[] | null>(null);
  const [leadRole, setLeadRole] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchSession = async () => {
      const response = await fetch("/api/storage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "REQUEST_STORAGE",
          payload: {
            url: `storage/${session.project}/preAnalysis/${session._id}/${session.name}`,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { file } = await response.json();

      setTranscript(file.transcript);
      setLeadRole(file.leadRole);
    };

    fetchSession().catch(() => {
      setError("Unable to load this session's transcript.");
    });
  }, []);

  return (
    <ViewSession
      transcript={transcript}
      session={session}
      leadRole={leadRole}
      error={error}
    />
  );
}
