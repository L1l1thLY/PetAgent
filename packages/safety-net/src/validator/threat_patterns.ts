// Ported from hermes-agent/tools/skills_guard.py (MIT License, Nous Research).
// See NOTICES.md for full attribution.
//
// Threat pattern dictionary for Safety Validator regex layer.
// M1 scope: starter set — ~30 of Hermes's 121 patterns. Rest land in a
// follow-up PR as we tie patterns to concrete threat categories.

export type ThreatCategory =
  | "prompt_injection"
  | "data_exfiltration"
  | "credential_harvest"
  | "command_injection"
  | "social_engineering"
  | "invisible_unicode";

export interface ThreatPattern {
  id: string;
  category: ThreatCategory;
  pattern: RegExp;
  description: string;
}

// Hermes ships 17 invisible/format-control characters that must never appear
// in agent-generated text without explicit justification.
export const INVISIBLE_CHAR_CLASS =
  /[\u200b\u200c\u200d\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2060\u2061\u2062\u2063\u2064\u2066\u2067]/u;

export const THREAT_PATTERNS: ThreatPattern[] = [
  // prompt_injection (starter set)
  {
    id: "pi.ignore_instructions",
    category: "prompt_injection",
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)\b/i,
    description: "classic ignore-previous-instructions injection",
  },
  {
    id: "pi.system_prompt_exfil",
    category: "prompt_injection",
    pattern: /\b(?:print|reveal|show|dump|output)\s+(?:your\s+)?(?:system\s+prompt|instructions|rules|guidelines)\b/i,
    description: "asks agent to leak its system prompt",
  },
  {
    id: "pi.role_override",
    category: "prompt_injection",
    pattern: /\b(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|pretend\s+to\s+be|act\s+as)\s+(?:a\s+)?(?:developer|admin|root|god|DAN|jailbroken)\b/i,
    description: "role override / jailbreak framing",
  },
  {
    id: "pi.instruction_injection_marker",
    category: "prompt_injection",
    pattern: /\[\[?\s*(?:SYSTEM|ADMIN|ROOT|DEVELOPER|PROMPT)\s*:/i,
    description: "pseudo-system marker trying to inject instructions",
  },

  // data_exfiltration
  {
    id: "de.send_conversation",
    category: "data_exfiltration",
    pattern: /\b(?:send|post|upload|exfiltrate)\s+(?:the\s+)?(?:conversation|chat|history|context)\s+to\s+(?:https?:\/\/|\S+\.\S+)/i,
    description: "attempt to exfiltrate conversation to a URL",
  },
  {
    id: "de.dns_tunnel",
    category: "data_exfiltration",
    pattern: /\b(?:curl|wget|fetch|http(?:s)?\.get)\s+(?:-[A-Za-z]+\s+)*https?:\/\/\S+\?(?:[A-Za-z_]+=\{[^}]+\}|[^&\s]+=\$\{[^}]+\})/i,
    description: "URL with templated exfil query params",
  },

  // credential_harvest
  {
    id: "ch.ssh_key_read",
    category: "credential_harvest",
    pattern: /\b(?:cat|less|more|readFile|fs\.read)\s+\S*(?:\.ssh\/id_(?:rsa|ed25519|ecdsa|dsa)|\.aws\/credentials|\.netrc|\.pgpass)\b/i,
    description: "read well-known credential file",
  },
  {
    id: "ch.env_secret_dump",
    category: "credential_harvest",
    pattern: /\b(?:printenv|env|process\.env)\s*(?:\||>|2>&1)/,
    description: "dumps full environment (may contain secrets)",
  },
  {
    id: "ch.aws_key_literal",
    category: "credential_harvest",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    description: "AWS access key literal",
  },
  {
    id: "ch.generic_secret_assign",
    category: "credential_harvest",
    pattern: /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{8,}["']/i,
    description: "hardcoded secret literal",
  },

  // command_injection
  {
    id: "ci.rm_rf_root",
    category: "command_injection",
    pattern: /\brm\s+-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*\s+(?:\/|~|\$HOME)(?!\S*\/\.petagent\/worktrees\/)/,
    description: "rm -rf near filesystem root",
  },
  {
    id: "ci.shell_exec_eval",
    category: "command_injection",
    pattern: /\b(?:eval|exec|Function)\s*\(\s*(?:request|req|input|body|params)\./i,
    description: "eval/exec on user input",
  },
  {
    id: "ci.pipe_to_shell",
    category: "command_injection",
    pattern: /\b(?:curl|wget|fetch)\s+\S+\s*\|\s*(?:bash|sh|zsh|ksh|dash)\b/,
    description: "curl | sh anti-pattern",
  },

  // social_engineering
  {
    id: "se.urgency_manipulation",
    category: "social_engineering",
    pattern: /\b(?:this\s+is\s+)?(?:urgent|emergency|critical|now|immediately).{0,60}\b(?:override|bypass|skip|ignore)\s+(?:safety|security|approval|review)/i,
    description: "urgency pressure to bypass safety",
  },

  // invisible_unicode (catch-all; more specific rules can be added per
  // category but this single pattern already flags anything in the class)
  {
    id: "iu.any_invisible_char",
    category: "invisible_unicode",
    pattern: INVISIBLE_CHAR_CLASS,
    description: "zero-width / bidi control char in agent output",
  },
];

export interface ThreatMatch {
  patternId: string;
  category: ThreatCategory;
  description: string;
  matched: string;
  index: number;
}

export function scanForThreats(text: string): ThreatMatch[] {
  const matches: ThreatMatch[] = [];
  for (const p of THREAT_PATTERNS) {
    const m = p.pattern.exec(text);
    if (m) {
      matches.push({
        patternId: p.id,
        category: p.category,
        description: p.description,
        matched: m[0],
        index: m.index,
      });
    }
  }
  return matches;
}
