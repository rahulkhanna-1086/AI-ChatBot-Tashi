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
    const compactPrompt = prompt.replace(/\s+/g, "").replace(/²/g, "2");
    if (compactPrompt.includes("e=mc2") || compactPrompt.includes("emc2") || prompt.includes("mass-energy equivalence")) {
      return "**E = mc²** is Einstein’s mass–energy equivalence equation. It says that mass and energy are two forms of the same thing.\n\n- **E** is energy, measured in joules.\n- **m** is mass, measured in kilograms.\n- **c** is the speed of light: about **300,000,000 metres per second**.\n- **c²** means that this already enormous speed is multiplied by itself.\n\nBecause **c²** is such a huge number, even a tiny amount of mass represents an enormous amount of energy. For example, if one gram of matter could be converted completely into energy, it would release roughly **90 trillion joules**.\n\nThe equation helps explain how the Sun produces energy, why nuclear reactions release much more energy than chemical reactions, and why an object’s energy contributes to its mass. It does **not** mean ordinary objects suddenly travel at the speed of light; it describes the amount of rest energy contained in their mass.";
    }
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
    return "I don’t have a live general-purpose AI model connected yet, so I can’t answer that reliably without guessing. Tashi is currently running in demonstration mode. Connect an AI provider in Settings to unlock open-ended questions.";
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
