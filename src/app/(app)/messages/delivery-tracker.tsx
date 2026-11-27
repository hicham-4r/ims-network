"use client";
import { useEffect, useRef } from "react";
import { acknowledgeChatDelivery } from "./actions";
import type { ThreadMessage } from "./chat-thread-core";
// Only acknowledge actual IDs rendered in the recipient browser, never a whole range.
export function DeliveryTracker({conversationId,actorId,messages}: {conversationId:string;actorId:string;messages:ThreadMessage[]}) {
  const attempted = useRef(new Set<string>());
  const idsKey = JSON.stringify(messages.filter(m=>m.senderUserId!==actorId && !m.delivered).map(m=>m.id).slice(0,30));
  useEffect(()=>{
    let cancelled=false;
    const ids = JSON.parse(idsKey) as string[];
    const run=()=>{
      if(cancelled || document.visibilityState!=="visible") return;
      const pending=ids.filter(id=>!attempted.current.has(id));
      if(!pending.length)return;
      pending.forEach(id=>attempted.current.add(id));
      if(attempted.current.size>120){for(const id of attempted.current){if(!ids.includes(id))attempted.current.delete(id);}}
      void acknowledgeChatDelivery({conversationId,messageIds:pending}).then(result=>{if(!result.ok)pending.forEach(id=>attempted.current.delete(id));}).catch(()=>{pending.forEach(id=>attempted.current.delete(id));});
    };
    const timer=window.setTimeout(run,350);
    document.addEventListener("visibilitychange",run);
    return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer);document.removeEventListener("visibilitychange",run);};
  },[conversationId,idsKey]);
  return null;
}
