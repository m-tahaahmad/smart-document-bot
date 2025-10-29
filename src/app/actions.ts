"use server";

import { createGroqAgent } from "@/lib/langchain";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

let sessionCache: {
    vectorStore?: MemoryVectorStore;
    chain?: any;
    embeddings?: any;
    llm?: any;
} = {};

async function extractText(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "application/pdf") {
        try {
            // Use require() for CommonJS modules
            const pdf = require("pdf-parse");
            const pdfData = await pdf(buffer);
            if (!pdfData.text || pdfData.text.trim().length === 0) {
                throw new Error("PDF appears to be empty or contains no extractable text");
            }
            return pdfData.text;
        } catch (error) {
            throw new Error(`Failed to parse PDF. The file may be corrupted or protected: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else if (file.type === "text/plain") {
        return buffer.toString("utf-8");
    } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        try {
            // DOCX file
            const mammoth = require("mammoth");
            const result = await mammoth.extractRawText({ buffer });
            if (!result.value || result.value.trim().length === 0) {
                throw new Error("DOCX appears to be empty or contains no extractable text");
            }
            return result.value;
        } catch (error) {
            throw new Error(`Failed to parse DOCX file: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        throw new Error("Unsupported file type");
    }
}

export async function handlePdfUpload(formData: FormData) {
    const file = formData.get("file") as File;
    if (!file) {
        return "No file provided";
    }

    let text: string;

    try {
        console.log("File type:", file.type);
        console.log("File size:", file.size);
        text = await extractText(file);
        console.log("Extracted text length:", text.length);
    } catch (error) {
        console.error("Error extracting text:", error);
        console.error("Error details:", error instanceof Error ? error.message : String(error));
        return `Failed to extract text from document: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Split text into chunks - limit to prevent too many embedding calls
    const allChunks = text.match(/.{1,1000}/g) || [];
    // Limit chunks to prevent too many API calls
    const chunks = allChunks.length > 50 ? allChunks.slice(0, 50) : allChunks;
    if (allChunks.length > 50) {
        console.log("Limiting chunks to 50 to prevent timeout");
    }
    console.log("Number of chunks:", chunks.length);

    try {
        // Initialize LangChain agent (gets embeddings and chain)
        console.log("Creating Groq agent...");
        const { embeddings, chain, llm } = await createGroqAgent();
        console.log("Groq agent created successfully");

        // Build vector store with the document content
        console.log("Building vector store...");
        const vectorStore = await MemoryVectorStore.fromTexts(
            chunks,
            chunks.map((_chunk: string, i: number) => ({ id: i })),
            embeddings
        );
        console.log("Vector store built successfully");

        // Cache everything for this session
        sessionCache = { vectorStore, chain, embeddings, llm };

        return "Document uploaded and processed successfully!";
    } catch (error) {
        console.error("Error in vector store creation:", error);
        return `Failed to process document: ${error instanceof Error ? error.message : String(error)}`;
    }
}

export async function chatWithBot(message: string) {
    if (!sessionCache.vectorStore || !sessionCache.llm)
        return "Please upload a document first.";

    const { vectorStore, llm } = sessionCache;

    // Retrieve similar context from PDF
    const retriever = vectorStore.asRetriever(3);
    const docs = await retriever.getRelevantDocuments(message);
    const context = docs.map((d) => d.pageContent).join("\n\n");

    // Format prompt for the LLM
    const systemPrompt = "You are a helpful assistant that answers questions based on the provided context from a document.";
    const userMessage = `Based on the following context from the document, answer the question:

Context:
${context}

Question: ${message}

Answer:`;

    const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
    ]);

    // Handle different response formats
    const answer = typeof response === 'string' ? response : (response.content || response.response || JSON.stringify(response));
    return answer;
}
