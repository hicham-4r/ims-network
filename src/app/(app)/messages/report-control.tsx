"use client";
import {useRef,useState} from "react";
import {Flag} from "lucide-react";
import {submitReport} from "../moderation/actions";
import styles from "./messages.module.css";
export function ReportControl({conversationId,messageId}:{conversationId:string;messageId:string}){
 const dialog=useRef<HTMLDialogElement>(null);const [busy,setBusy]=useState(false);const [status,setStatus]=useState("");
 return <><button type="button" aria-label="Report message" title="Report message" onClick={()=>{setStatus("");dialog.current?.showModal();}}><Flag size={14} aria-hidden="true"/></button><dialog ref={dialog} aria-label="Report message" className="ims-report-dialog"><h2>Report message</h2><p>Only the category and message reference are stored. The message body is not shared with reviewers.</p><form onSubmit={event=>{event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);setBusy(true);void submitReport({conversationId,messageId,category:form.get("category")}).then(r=>setStatus(r.ok?"Report recorded. See Safety & reports.":"Report unavailable.")).catch(()=>setStatus("Report unavailable.")).finally(()=>setBusy(false));}}><label>Reason<select name="category" required><option value="SPAM">Spam</option><option value="HARASSMENT">Harassment</option><option value="OTHER">Other</option></select></label><div className="ims-report-actions"><button type="submit" className={styles.threadButton} disabled={busy}>Submit report</button><button type="button" className={styles.threadButton} onClick={()=>dialog.current?.close()}>Close</button></div>{status&&<p role="status">{status}</p>}</form></dialog></>;
}
