/**
 * ImplementationChoice — THE one entitlement-aware implementation component.
 *
 * Used everywhere an implementation choice is offered: after a Galileo answer,
 * after a What If result, on an opportunity, and on a strategy. One component,
 * one resolver (implementationAccess), many contexts. There are deliberately no
 * per-surface variants.
 *
 * WHAT IT IS NOT
 * Not a pricing table. Not a checkout. There is no billing system in this
 * application, so when access does not exist the button opens the ONE existing
 * mechanism the rest of the product already uses — the same /strategy-call
 * destination MembershipUpgradeBanner sends people to. No fake purchase, no
 * invented plan, no price shown (the product system exposes no current pricing).
 *
 * THE RULE THIS COMPONENT ENFORCES
 * Never sell someone something they already have. If the owner has access, the
 * card says so and offers an ACTION. If they do not, it offers discovery of the
 * access path. If an advisor is already attached, it names them.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Users, ArrowRight, Lock } from 'lucide-react';

export default function ImplementationChoice({
  access,
  onGalileo,
  onTeam,
  disabled = false,
  heading = 'How do you want to move forward?',
  // SELL AFTER VALUE. Where the owner has not yet seen what implementation
  // would look like, locked doors are withheld here and shown after the
  // implementation preview instead.
  hideLocked = false,
}) {
  const navigate = useNavigate();

  const galileo = access?.galileo && !(hideLocked && access.galileo.locked) ? access.galileo : null;
  const team = access?.team && !(hideLocked && access.team.locked) ? access.team : null;
  if (!galileo && !team) return null;

  /** One action router for both cards: an access door, or the real path. */
  const run = (path, handler) => {
    if (disabled) return;
    if (path.action?.type === 'access') {
      navigate(path.action.destination);
      return;
    }
    handler?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-3"
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">{heading}</p>

      <div className={`grid gap-2.5 ${galileo && team ? 'sm:grid-cols-2' : ''}`}>
        {galileo && (
          <PathCard
            icon={Sparkles}
            path={galileo}
            onSelect={() => run(galileo, onGalileo)}
            disabled={disabled}
          />
        )}
        {team && (
          <PathCard
            icon={Users}
            path={team}
            onSelect={() => run(team, onTeam)}
            disabled={disabled}
            expert={team.assignedExpert}
          />
        )}
      </div>
    </motion.div>
  );
}

function PathCard({ icon: Icon, path, onSelect, disabled, expert = null }) {
  const locked = !!path.locked;

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${locked ? 'text-white/35' : 'text-vision-gold/80'}`} />
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/45">
            With {path.path === 'galileo' ? 'Galileo' : 'your team'}
          </span>
        </div>

        <p className="text-[12.5px] leading-relaxed text-white/70">{path.description}</p>

        {/* A real relationship is named. A fake one never is. */}
        {expert?.name && (
          <div className="space-y-0.5 pt-0.5">
            <p className="text-[13px] font-medium leading-snug text-white/90">{expert.name}</p>
            {expert.role && (
              <p className="text-[10.5px] uppercase tracking-wider text-vision-champagne/70">
                {formatRole(expert.role)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          {locked && <Lock className="h-2.5 w-2.5 shrink-0 text-white/30" />}
          <span
            className={`text-[9.5px] uppercase tracking-[0.16em] ${
              locked ? 'text-white/30' : 'text-vision-champagne/70'
            }`}
          >
            {path.statusLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={onSelect}
          disabled={disabled}
          className={
            locked
              ? 'inline-flex items-center gap-1.5 rounded-full border border-white/[0.11] px-3.5 py-1.5 text-[11.5px] text-white/60 transition-colors hover:border-vision-gold/30 hover:text-white/85 disabled:opacity-40 vision-focus'
              : 'inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-3.5 py-1.5 text-[11.5px] font-medium text-black transition-colors hover:bg-vision-bright disabled:opacity-40 vision-focus'
          }
        >
          {path.ctaLabel}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/** `expert_advisor` → `Expert advisor`. Never renders a raw snake_case token. */
function formatRole(role) {
  return String(role).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}