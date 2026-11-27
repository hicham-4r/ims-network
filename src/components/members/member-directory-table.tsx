import Link from "next/link";
import { MemberAvatar } from "@/components/members/member-avatar";

type MemberRow = { userId: string; displayName: string; program: string | null; graduationYear: number | null; bio: string | null; jobTitle?: string | null; company?: string | null; location?: string | null; skills?: string | null; mentorship?: string | null; hasAvatar: boolean; avatarVersion: string };

export function MemberDirectoryTable({ members, showAvatars = true }: { members: MemberRow[]; showAvatars?: boolean }) {
  if (!members.length) return <div className="ims-empty">No active members match this view.</div>;
  // One semantic table and one avatar per member. CSS adapts rows to cards,
  // including when the directory is embedded in a narrow dashboard column.
  return (
    <div className="ims-table-wrap" role="region" aria-label="Alumni directory" tabIndex={0}>
      <table className="ims-directory-table" role="table">
        <caption className="sr-only">Active alumni</caption>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Alumni</th><th scope="col" role="columnheader">Program</th><th scope="col" role="columnheader">Class</th><th scope="col" role="columnheader">Expertise / about</th><th scope="col" role="columnheader"><span className="sr-only">Profile action</span></th></tr></thead>
        <tbody role="rowgroup">{members.map(member => (
          <tr key={member.userId} role="row">
            <td role="cell" className="ims-dir-person"><div className="ims-person"><MemberAvatar userId={member.userId} displayName={member.displayName} hasAvatar={showAvatars && member.hasAvatar} version={member.avatarVersion} size="sm"/><div className="min-w-0"><Link href={`/members/${encodeURIComponent(member.userId)}`} prefetch={false} className="ims-person-name">{member.displayName}</Link>{(member.jobTitle || member.company || member.location) && <span className="ims-professional-subtitle">{[member.jobTitle, member.company, member.location].filter(Boolean).join(" · ")}</span>}</div></div></td>
            <td role="cell" className="ims-dir-program"><span className="ims-dir-label" aria-hidden="true">Program</span><span>{member.program || "—"}</span></td>
            <td role="cell" className="ims-dir-class tabular-nums"><span className="ims-dir-label" aria-hidden="true">Class</span><span>{member.graduationYear ?? "—"}</span></td>
            <td role="cell" className="ims-dir-about"><span className="ims-dir-label" aria-hidden="true">About</span>{member.skills ? <div className="ims-skill-tags" aria-label="Skills">{Array.from(new Set(member.skills.split(/[,;\n]/).map(skill => skill.trim()).filter(Boolean))).slice(0,4).map(skill => <span key={skill}>{skill}</span>)}</div> : <span className="ims-dir-bio">{member.bio || "—"}</span>}{member.mentorship === "open" && <span className="ims-mentor-label">Open to mentor</span>}{member.mentorship === "seeking" && <span className="ims-mentor-label">Seeking mentor</span>}</td>
            <td role="cell" className="ims-dir-action"><Link href={`/members/${encodeURIComponent(member.userId)}`} prefetch={false} className="ims-outline-button" aria-label={`View ${member.displayName}'s profile`}>View profile</Link></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
