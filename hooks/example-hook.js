#!/usr/bin/env node
// Confirmo Claude Code Status Hook
// This script is called by Claude Code hooks to update Confirmo's status tracking

const fs = require('fs')
const path = require('path')
const os = require('os')

const STATUS_DIR = path.join(os.homedir(), '.confirmo', 'claude-status')
const STATUS_FILE = path.join(STATUS_DIR, 'status.json')
const SESSIONS_DIR = path.join(STATUS_DIR, 'sessions')

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(STATUS_DIR)) {
    fs.mkdirSync(STATUS_DIR, { recursive: true })
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

// Atomic write using temp file + rename
function writeStatusAtomic(filePath, data) {
  const tempPath = filePath + '.tmp.' + process.pid
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2))
    fs.renameSync(tempPath, filePath)
  } catch (e) {
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tempPath)
    } catch (_) {}
    throw e
  }
}

// Read current status or create empty
function readStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'))
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { version: 1, lastUpdated: Date.now(), sessions: {} }
}

// Update session status
function updateSession(sessionId, updates) {
  ensureDirs()

  // Update per-session file
  const sessionFile = path.join(SESSIONS_DIR, sessionId.replace(/[/\\:]/g, '_') + '.json')
  let session = { sessionId, startedAt: Date.now() }
  try {
    if (fs.existsSync(sessionFile)) {
      session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
    }
  } catch (e) {
    // Ignore parse errors
  }

  Object.assign(session, updates, { lastUpdated: Date.now() })
  writeStatusAtomic(sessionFile, session)

  // Update main status file
  const status = readStatus()
  status.sessions[sessionId] = session
  status.lastUpdated = Date.now()

  // Clean up old sessions (older than 24h)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [id, sess] of Object.entries(status.sessions)) {
    if (sess.endedAt && sess.endedAt < cutoff) {
      delete status.sessions[id]
      try {
        fs.unlinkSync(path.join(SESSIONS_DIR, id.replace(/[/\\:]/g, '_') + '.json'))
      } catch (e) {
        // Ignore
      }
    }
  }

  writeStatusAtomic(STATUS_FILE, status)
}

// Main
async function main() {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
  }

  if (!input.trim()) {
    process.exit(0)
  }

  let data
  try {
    data = JSON.parse(input)
  } catch (e) {
    // Invalid JSON input, exit silently
    process.exit(0)
  }

  const {
    session_id,
    cwd,
    hook_event_name,
    tool_name,
    tool_input,
    prompt,
    source,
    reason
  } = data

  if (!session_id) {
    process.exit(0)
  }

  const now = Date.now()

  switch (hook_event_name) {
    case 'SessionStart':
      updateSession(session_id, {
        status: 'idle',
        workingDirectory: cwd,
        startedAt: now,
        lastEvent: { type: 'session_start', timestamp: now, details: source }
      })
      break

    case 'UserPromptSubmit':
      // Extract user's actual prompt, filtering out system tags
      let title = undefined
      if (prompt) {
        let cleanPrompt = String(prompt)
        // Remove system tags and their content
        cleanPrompt = cleanPrompt.replace(/<system[-_]?(?:instruction|reminder)[^>]*>[\s\S]*?<\/system[-_]?(?:instruction|reminder)>/gi, '')
        // Remove any remaining XML-like tags at the start
        cleanPrompt = cleanPrompt.replace(/^[\s\n]*<[^>]+>[\s\S]*?<\/[^>]+>[\s\n]*/gi, '')
        // Trim and get first line
        cleanPrompt = cleanPrompt.trim()
        if (cleanPrompt) {
          title = cleanPrompt.slice(0, 100).split('\n')[0].trim()
        }
      }
      updateSession(session_id, {
        status: 'working',
        workingDirectory: cwd,
        sessionTitle: title,
        lastEvent: { type: 'prompt_submit', timestamp: now, details: title }
      })
      break

    case 'PreToolUse':
      let toolDetails = tool_name || 'unknown'
      if (tool_input && typeof tool_input === 'object') {
        // Try various known field names for different tools
        if (tool_input.command) {
          // Bash tool
          toolDetails += ': ' + String(tool_input.command).slice(0, 50)
        } else if (tool_input.file_path) {
          // Read/Edit/Write tools
          toolDetails += ': ' + path.basename(String(tool_input.file_path))
        } else if (tool_input.pattern && tool_input.path) {
          // Grep/Glob with path
          toolDetails += ': ' + String(tool_input.pattern).slice(0, 30) + ' in ' + path.basename(String(tool_input.path))
        } else if (tool_input.pattern) {
          // Grep/Glob without path
          toolDetails += ': ' + String(tool_input.pattern).slice(0, 30)
        } else if (tool_input.url) {
          // WebFetch tool
          toolDetails += ': ' + String(tool_input.url).slice(0, 50)
        } else if (tool_input.query) {
          // WebSearch tool
          toolDetails += ': ' + String(tool_input.query).slice(0, 50)
        } else if (tool_input.prompt) {
          // Task tool
          toolDetails += ': ' + String(tool_input.prompt).slice(0, 50)
        } else if (tool_input.description) {
          // Task tool (short description)
          toolDetails += ': ' + String(tool_input.description).slice(0, 50)
        } else if (tool_input.notebook_path) {
          // NotebookEdit tool
          toolDetails += ': ' + path.basename(String(tool_input.notebook_path))
        } else if (tool_input.skill) {
          // Skill tool
          toolDetails += ': ' + String(tool_input.skill)
        } else {
          // Fallback: show first string value found
          for (const [key, value] of Object.entries(tool_input)) {
            if (typeof value === 'string' && value.length > 0) {
              const displayValue = value.length > 40 ? value.slice(0, 40) + '...' : value
              toolDetails += ': ' + displayValue
              break
            }
          }
        }
      }
      // Tools that need user attention (ExitPlanMode, AskUserQuestion, etc.)
      const attentionTools = ['ExitPlanMode', 'AskUserQuestion', 'mcp__conductor__AskUserQuestion']
      const needsAttention = attentionTools.includes(tool_name)
      updateSession(session_id, {
        status: 'working',
        needsAttention: needsAttention ? tool_name : null,
        pendingToolUse: { tool: tool_name || 'unknown', details: toolDetails, timestamp: now },
        lastEvent: { type: 'tool_use', timestamp: now, details: toolDetails }
      })
      break

    case 'PostToolUse':
      // Don't update lastEvent - keep the detailed info from PreToolUse
      // Just update timestamp to show activity continues
      updateSession(session_id, {
        status: 'working',
        pendingToolUse: null
      })
      break

    case 'Stop':
      updateSession(session_id, {
        status: 'completed',
        lastEvent: { type: 'stop', timestamp: now }
      })
      break

    case 'SessionEnd':
      updateSession(session_id, {
        status: 'idle',
        endedAt: now,
        lastEvent: { type: 'session_end', timestamp: now, details: reason }
      })
      break

    default:
      // Unknown event, ignore
      break
  }
}

main().catch(() => process.exit(0)) // Silent failures

