import { Suspense } from "react";

import { ChatClient } from "@/components/chat/chat-client";

export default function ChatPage() {
  // ChatClient reads ?c=<conversation id>, which needs a Suspense boundary
  return (
    <Suspense>
      <ChatClient />
    </Suspense>
  );
}
