#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Cadence — production-ready AI appointment-scheduling SaaS (Next.js + TS + Supabase + Tailwind + shadcn + Framer Motion + PWA). Uses EXISTING Supabase schema (never redesign). Build order: Auth, Onboarding, Dashboard, Calendar, Patients, Services, Working Hours, Waiting List, Scheduler, AI NL parser (Gemini 2.5 Flash via Emergent), Optimization Preview, Analytics, Templates, Settings, Landing, PWA."

backend:
  - task: "Supabase Auth (email/password) + SSR cookie sessions + protected-route middleware"
    implemented: true
    working: true
    file: "lib/supabase/*.ts, middleware.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Verified via node script: signUp returns session (email confirm OFF), profiles row auto-created by handle_new_user trigger. Middleware redirects unauth->/login and auth->/dashboard."
  - task: "Onboarding DB writes against real schema (profiles update, business insert, working_hours insert) under RLS"
    implemented: true
    working: true
    file: "components/onboarding/onboarding-wizard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Verified via authenticated node script: profile update OK, business insert OK, 7x working_hours insert OK, read-back OK. RLS permits owner operations."

frontend:
  - task: "Landing page (premium hero + features, Framer Motion)"
    implemented: true
    working: true
    file: "components/landing/landing.tsx, app/page.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Renders 200, screenshot verified. Redirects to /dashboard when authenticated."
  - task: "Auth pages (login, signup, forgot-password)"
    implemented: true
    working: true
    file: "app/(auth)/**"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Screenshot verified; signup->onboarding redirect confirmed in real browser."
  - task: "Onboarding wizard UI (4-step)"
    implemented: true
    working: true
    file: "components/onboarding/onboarding-wizard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Browser-verified: signup->onboarding, name pre-filled, step transitions, business-name validation gating Continue."
  - task: "App shell (sidebar 12 modules, topbar, theme toggle, user menu, mobile drawer) + Dashboard + module scaffolds"
    implemented: true
    working: true
    file: "components/app-shell/**, app/(app)/**"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Routes compile; /dashboard guarded (redirects to /onboarding until completed). Data modules are scaffolds pending build."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Auth + Onboarding end-to-end (verified by main via scripts + screenshots)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Milestone 1 complete: Landing, Email auth, Onboarding (real Supabase writes verified under RLS), protected app shell + dashboard + module scaffolds. Email confirmation disabled by user. Next planned: Patients/Services CRUD, Working Hours editor, Calendar, then AI NL parser (Gemini 2.5 Flash via Emergent) + Scheduler optimization preview. Awaiting user go-ahead on next module priority and whether to run automated frontend testing."
