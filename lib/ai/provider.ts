export type ChatTurn = { author: string; body: string; ai?: boolean };

export type ChatRequest = {
  prompt: string;
  room: string;
  history: ChatTurn[];
};

export interface AiProvider {
  readonly name: string;
  generate(request: ChatRequest): Promise<string>;
  healthCheck(): Promise<boolean>;
}

export class DemoProvider implements AiProvider {
  readonly name = "demo";

  async healthCheck() { return true; }

  async generate(request: ChatRequest) {
    const prompt = request.prompt.toLowerCase();
    if (prompt.includes("7 continent") || prompt.includes("seven continent") || (prompt.includes("continent") && prompt.includes("name"))) {
      return "The seven continents are:\n\n1. **Africa**\n2. **Antarctica**\n3. **Asia**\n4. **Europe**\n5. **North America**\n6. **South America**\n7. **Australia** (often grouped with nearby Pacific islands as **Oceania**)";
    }
    if (prompt.includes("principle") || prompt.includes("design")) {
      return "I’d use three principles:\n\n**1. Begin with clarity** — make the next useful action unmistakable.\n\n**2. Keep the human context** — let the conversation, not the tool, remain the centre of attention.\n\n**3. Earn complexity** — reveal deeper controls only when they become useful.\n\nThat gives the team a simple test for every decision: does this make collaboration feel clearer, warmer, or more capable?";
    }
    if (prompt.includes("summar")) {
      return `Here’s the thread I see in **${request.room}**: the team wants meaningful momentum without unnecessary complexity. The clearest next step is to choose one small outcome, assign an owner, and test it with a real person.`;
    }
    if (prompt.includes("idea") || prompt.includes("brainstorm")) {
      return "Here are three directions worth exploring:\n\n**Quiet guidance** — suggest the next step without interrupting the room.\n\n**Shared memory** — surface decisions and open questions at the right moment.\n\n**Thoughtful handoffs** — turn discussion into a clear owner, outcome, and follow-up.";
    }
    return `I’m with you. A useful way to move this forward is to separate the **outcome you want**, the **constraint that matters most**, and the **smallest test** that would teach us something. What outcome should we optimise for first?`;
  }
}

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter";
  constructor(private readonly apiKey: string, private readonly model = "openai/gpt-oss-20b:free") {}

  async healthCheck() { return Boolean(this.apiKey); }

  async generate(request: ChatRequest) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "x-title": "Tashi" },
      body: JSON.stringify({ model: this.model, temperature: 0.65, messages: [
        { role: "system", content: "You are Tashi, a warm, precise AI teammate in a collaborative room. Be concise, constructive, and practical. Use markdown when helpful." },
        ...request.history.map(turn => ({ role: turn.ai ? "assistant" : "user", content: `${turn.author}: ${turn.body}` })),
        { role: "user", content: request.prompt },
      ] }),
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content?.trim() || "I’m ready to help. Could you say a little more?";
  }
}

export function createProvider(): AiProvider {
  const key = process.env.OPENROUTER_API_KEY;
  return key ? new OpenRouterProvider(key, process.env.OPENROUTER_MODEL) : new DemoProvider();
}
