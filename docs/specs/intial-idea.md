I am a senior software engineer with .NET Core , TypeScript, and Devops experience who loves to experiment with agentic coding and AI driven software development in April 2026. One problem which I see is the lack of memory in coding agents. Let's say I follow a spec driven workflow on a green field project with a coding agent (claude code, gh copilot, codex, opencode, etc.) and I have broken down my project in epics and tasks and the agent starts implementing those following my tasks and design documents - once the session is over and I start a new session (due to context pollution or starting a new task) the new agent knows nothing about the experience, knowledge and memory gained during the prior session. You can of course document work from the session and then feed that to the new session but this is obviously not scalable, manual process and tedious - you need to also keep the docs up to date which is a task by itself.

Here comes my idea:  **Chronicle**- a **project-scoped, local memory layer** that lives inside the repo (version-controlled and team-shareable) giving coding agents persistent memory across sessions using sql lite as the underlying storage technology. I would like to build this for personal use and local only solution to fix the problem with agents having no memory when working on a projects - this would also build a local version controlled knowledge base for the particular project (project scoped). 

### High Level MVP Idea 

We develop a custom slash command/workflow/skill/automation for creating or updating a memory (/create-memory, /update-memory, etc.). When create a memory is called this should basically do a couple of things:

1. Export the full conversation transcript up until now from the current coding agent session (claude code, codex, gh copilot, or opencode).
2. Then, the exported transcript of the session should be analyzed. Ideally, this should be done in parallel via a background agent or a subagent, depending on what the original coding agent harness supports, but if not possible it can also be delegated to an external api call to a cloud provider or even a local model in ollama. The critical part is that this step needs to be very fast, so a lightweight smart and cheap model for text classification and summarization should be used (i.e. Claude Haiku, Gemini Flash, Gemma 4, Qwen3.5 4B, etc.). The process should then perform the analysis and generate a structured memory entry:
    1. Title - after reading the whole session content
    2. Description - concise description on what, why, how and what the session is about - very short, couple of sentences but this is crucial and should give a clear signal when this memory should be used/pulled for new agents - similar to how the description field in an agent skill (agentskills protocol) works.
    3. Summary - Summarized version of the complete session - a report with what was learned, what were the goals, what is the current state, what are relevant files for this info, etc. - basically the most important information of the session and why/what we did. **IMPORTANT**: Here we need to spend time and design the actual format of the summary field content as well as the system prompt for generating it.
3. Once the memory entry is defined the LLM should interact with an sql lite interface (providing only the required sql lite access/functionality and not broad sql operation) to store the memory - i.e. uses a createMemory utility/function/script which encapsulates the actual sql logic. 
   At this point we have stored the memory locally and we can end the session, or continue work. 
   4. Now comes the final part - the memory retrieval. When a new session is started the fresh AI coding agent should always query the local sql store and depending on what is the user request it should autonomously decide which memory to pull and feed it to the context. 
	- We need to decide how to trigger this automatically but what comes to mind is that it can be done via an agent hook that triggers on an event for starting a new session/conversation/prompt - the specific implementation will differ slightly from agent to agent due to the fact that the hooks support and the exposed events are slightly different in  example opencode vs claude code or github copilot. 
	- When the hook triggers it should use another provided sql lite interface which exposes a function/utility/script to query the sql lite database and return all of the memory entries (sessions) that we have created for this project but only the **title** and **description** (this operation should be lighting fast and should not pollute the context with too much data as this operation will basically run on every new session/prompt and the session will always start with pulling this context). 
	- At this point the agent should decide (following a custom instruction prompt) which memory is relevant for the current session depending on the user request. To determine this the agent will use the titles, and descriptions that it has pulled from the memory store at the beginning of the session. 
	- The decision which memories are relevant and their retrieval is a critical part of this solution. It's the main innovation of this memory layer as it will depend on the advanced reasoning capabilities of the latest frontier models to decide the appropriate selection. This differs from cosine similarity and traditional RAG based embedding approaches which introduce a lot of complexity and do not provide much better result than the latest frontier reasoning models and their internal tooling. Because of this, we need to carefully plan the system prompt for the LLM to make the decision and retrieval of the relevant memory the most effective. 
5. Once the agent pin points one ore more memory entries that it needs, it will call another sql lite interface which will expose a function/utility/script for pulling the whole (actual) memory entry (title, description, and summary) based on the input (i.e. title or description) that it pinpointed. 
	* At this point the agent will read the memory and gain knowledge about the past task/tasks - fixing the issue with no memory of past actions/projects/etc. 
	* Here we need to see how we can inject the memory in the context of the currently running session of the agent (claude code, codex, gh copilot, opencode, etc.), i.e hooks stdin, etc.

### Extra Points

- **Memory operations**: apart from creating a memory, we should also plan for updating existing memories, even tackling memory staleness at some point, handle session compaction, etc. There are multiple use cases here (non exhaustive):
    - Triggering an update explicitly in the session - let's say you have a session and you decide to create a memory. Then you continue working in the same session and you do extra work on top + gain new knowledge - at this point we should be able to update the stored memory with the new/extra info. How do we do that?
    - Triggering an update to a memory from a different session - there might be a case where you work on a different session, maybe you have pulled a created memory or maybe not, in this new session you learn something that affects the old memory and it needs to be updated - how do we tackle this?
    - Triggering an automatic memory creation/update when a session compaction (session context limit) is about to happen, so that we do not loose the data. How do we handle mid session compaction before the session is ready for memory creation? Session snapshots which are then summarized together as a memory when memory creation is reached?
    - Conflicting memories: Memory A says "we use Prisma for DB access." Memory B (newer) says "we migrated to Drizzle." The agent pulls both. How do we handle this? I guess it falls in the category of memory staleness.
    - Some other cases regarding memory management might be there for agentic coding - what are some edge cases in this context that we might hit.
	- How do we handle a memory creation from a session which has already loaded a prior memory - basically hierarchical memories? Storing a ref? Memory Graph? Storing both together? What if there are multiple? We need to brainstorm here.
- **Context pollution**: We need to be careful when pulling the memory - it might be that there is too much memory that the agents wants to pull which will basically pollute the context - we should also design around some limits/confirmations/adjustments by the user. (i.e. maxMemmories to pull, maxSummaryTokens, etc.
  Example flow with a budget and confirmation:
	- -> **New session starts**
	  -> **Fetch `title` , `description` for all memories** 
	  -> **Agent reads list and decides: which memories are relevant to this session?** Following instruction: i.e.: "Select 0–5 memories max. If uncertain, prefer fewer. Output memory IDs to pull."
	  -> **Context Budget Check**
		 config.json defines:
		    │     maxMemoriesToPull: 5         ← hard ceiling
		    │     maxSummaryTokens: 5000       ← total token budget for injected memories
		    │     requireConfirmationAbove: 1  ← ask user if >4 memory would be pulled
		    ├─ If 0 memories selected → proceed, no injection
		    ├─ If 3 memory → auto-inject (below threshold)
		    └─ If 4+ memories → PAUSE → show user: 
	           "I want to pull these memories:
	            1. [title] (~800 tokens)
	            2. [title] (~1200 tokens)
	            3. [title] (~500 tokens)
	            4. [title] (~1000 tokens)
	            Total: ~3500 tokens. Proceed? [y/n/select]"
	  -> **Agent Fetches full memory entry**
	  -> **Inject memories into context**

- What other use cases or points/edge cases am I missing for this local memory layer given my use case and field of application.

### Considerations

- For the MVP, we should stick with SQL Lite, no vector stores. At some point in the future we might consider a vector store and embeddings solution, see below for qmd.
* I am aware of the built-in memory solutions of coding agents (Copilot memory, Claude Memory). Those solutions do not tackle my problems of version controlled memory, with specific layers and semantics of building a knowledge base.
* There are interesting solutions for the underlying storage and retrieval mechanism. Most notably:
	* https://github.com/tobi/qmd -> Most interesting solution for our use case - integrates  hybrid semantic + BM25 + reranked retrieval search with local embeddings and sql lite. The retrieval mechanism is pretty cool and could replace our LLM reasoning based retrieval if result are not good enough but as for now we will leave it in the backlog.
	* https://github.com/volcengine/OpenViking -> File system based context database for Agents. Looks interesting for the storage layer but I do not see much benefit of using it as of now over plain sql lite
* Existing memory solutions:
	* https://github.com/omega-memory/omega-memory -> Closest to our idea but gated by cloud features. It is open source though, so we might look into some of the implementation to get inspiration
	* https://github.com/affaan-m/everything-claude-code/tree/main/scripts/hooks -> Curated repo of claude code integrations. Doesn't directly have the same memory idea but does have some interesting hooks and automation examples for session summarization and injection which might be relevant for part of our mechanisms.
* Technological and design choices:
	* I am the most comfortable with .NET Core but given the industry direction it seems to not be very popular with CLI tool development and agents integration, so Typescript is also a fallback option. In general I would like to develop this with the least amount of external dependencies
	* Ideally I would like to encapsulate most of the implementation as a CLI tool (sql lite crud operations, repo onboarding setup for the memory solution, commands for handling background tasks, etc.) but there might be some overlapping operations which will probably need to be handled by the coding agent itself and enforced via instructions, hooks, etc. But we should aim to encapsulate as much of the functionality as possible into the cli tool
	* Ideally I would like to be able to package the solution somehow and easily integrate it in any of my software repositories
	* We should scope this to only GitHub Copilot and Claude Code initially with support for Codex, OpenCode, and Gemini CLI in the future backlog. After we agree on the solution design and functional requirements we should do a deep research on both the Claude Code and GH Copilot documentation to see what we need to implement specifically to support the memory on their side (hooks, skills, commands, session export, etc.).
	* It might be an interesting idea to store memory files on the file system alongside the sql lite entries for easier developer work (reading the memory, diffing memory, etc.) but this will require a synchronization effort. Not sure about it, we should brainstorm.

### Core Development Philosophy

In general I would like to build this for myself (no large teams collaboration or enterprise features and edge cases with multi-branch scenarios, secrets in sessions audit, etc.) and we should aim for the easiest, most lightweight and not overengineered solution. We want to keep it boring - our goal is rapid prototyping and fast MVP implementation for a bear minimum working solution. We can tackle other topics/extra features/improvements/production readiness in further iterations - but we need to have a plan for future extensibility of course.

### Task

Your task is to brainstorm with me and fully refine the idea until there are no logical and functional ambiguities left. You need to think deeply about the solution and thoughtfully ask me questions using your Ask User Question Tool until we both have a crystal clear idea of what we need to build, what are our functional requirements, what we want to descope from the MVP and how we want to build the whole solution.