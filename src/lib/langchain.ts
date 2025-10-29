// lib/langchain.ts
import { ChatGroq } from "@langchain/groq";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { FakeEmbeddings } from "@langchain/core/utils/testing";

export async function createGroqAgent() {
    // 1️⃣ LLM
    const llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY!,
        model: "llama-3.1-8b-instant", // Updated to current model
        temperature: 0.3,
    });

    // 2️⃣ Embeddings - using fake embeddings for now (no external API needed)
    // HuggingFace was timing out, so we use fake embeddings for fast processing
    const embeddings = new FakeEmbeddings();
    console.log("Using fake embeddings for fast processing");

    // 3️⃣ Memory
    const memory = new BufferMemory({
        memoryKey: "chat_history",
        returnMessages: true,
    });

    // 4️⃣ Return llm and chain separately
    const chain = llm;

    return { chain, embeddings, llm };
}
