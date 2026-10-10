import type { ReactNode } from "react";
import styles from "./UserCard.module.css";

export interface UserCardProps {
  /** Required: the person's display name. */
  name: string;
  /** Avatar image URL. */
  avatar?: string;
  /** Short biography line. */
  bio?: string;
  /** Role label shown under the name. */
  role?: string;
  /** Projected action controls (equivalent to the ADX `actions` slot). */
  actions?: ReactNode;
  /** Fired when the card is clicked. */
  onClick?: (payload: { name: string; target: EventTarget | null }) => void;
  /** Fired when the follow control is activated. */
  onFollow?: (payload: { name: string }) => void;
}

export function UserCard({
  name,
  avatar = "/default.png",
  bio = "",
  role = "User",
  actions,
  onClick,
}: UserCardProps) {
  return (
    <article
      className={styles.card}
      onClick={(event) => onClick?.({ name, target: event.target })}
    >
      <img className={styles.avatar} src={avatar} alt={name} />
      <div className={styles.content}>
        <h2 className={styles.name}>{name}</h2>
        <p className={styles.role}>{role}</p>
        {bio ? <p className={styles.bio}>{bio}</p> : null}
      </div>
      <div className={styles.actions}>{actions}</div>
    </article>
  );
}
