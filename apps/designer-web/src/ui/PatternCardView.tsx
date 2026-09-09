/**
 * Shared SD3 pattern card for Schema rail + Causal pattern nodes (plan S11).
 */

import type { PatternCardPayload } from '@spds/graph-projection';

export interface PatternCardViewProps {
  readonly card: PatternCardPayload;
  readonly compact?: boolean;
  readonly className?: string;
}

export function PatternCardView(props: PatternCardViewProps) {
  const { card, compact } = props;
  const maxParams = compact ? 4 : card.parameters.length;
  return (
    <div
      className={['sdi-pattern-card-view', props.className].filter(Boolean).join(' ')}
      data-testid="pattern-card-view"
    >
      {!compact ? <strong>{card.title}</strong> : null}
      <p>{card.intent}</p>
      {card.parameters.length > 0 ? (
        <ul>
          {card.parameters.slice(0, maxParams).map((p) => (
            <li key={p.key}>
              {p.key}
              {p.value ? ` = ${p.value}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {!compact && card.rules.length > 0 ? (
        <p className="sdi-rf-pattern-ops">Rules: {card.rules.slice(0, 4).join(', ')}</p>
      ) : null}
      {card.operators.length > 0 ? (
        <p className="sdi-rf-pattern-ops">Ops: {card.operators.join(', ')}</p>
      ) : null}
    </div>
  );
}
