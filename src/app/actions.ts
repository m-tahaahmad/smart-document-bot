"use server";

import { createGroqAgent } from "@/lib/langchain";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createRequire } from "module";
import { ChatGroq } from "@langchain/groq";
import { FakeEmbeddings } from "@langchain/core/utils/testing";

const require = createRequire(import.meta.url);

let sessionCache: {
    vectorStore?: MemoryVectorStore;
    chain?: ChatGroq;
    embeddings?: FakeEmbeddings;
    llm?: ChatGroq;
} = {};

async function extractText(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "application/pdf") {
        // First, try with pdf-parse
        try {
            const pdf = require("pdf-parse");
            const pdfData = await pdf(buffer);
            
            if (!pdfData.text || pdfData.text.trim().length === 0) {
                throw new Error("PDF appears to be empty or contains no extractable text");
            }
            return pdfData.text;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // If it's an XRef error, try fallback method with pdf2json
            if (errorMessage.includes("XRef") || errorMessage.includes("xref")) {
                try {
                    // Try fallback with pdf2json - more robust with problematic PDFs
                    const PDFParser = require("pdf2json");
                    const pdfParser = new PDFParser(null, 1);
                    
                    return new Promise<string>((resolve, reject) => {
                        // Set a timeout to prevent hanging
                        const timeout = setTimeout(() => {
                            reject(new Error("PDF parsing timeout - the file may be too large or corrupted"));
                        }, 30000); // 30 second timeout
                        
                        pdfParser.on("pdfParser_dataError", (errData: { parserError: string }) => {
                            clearTimeout(timeout);
                            reject(new Error(`PDF parsing error: ${errData.parserError}`));
                        });
                        
                        pdfParser.on("pdfParser_dataReady", (pdfData: { Pages: Array<{ Texts: Array<{ R: Array<{ T: string }> }> }> }) => {
                            clearTimeout(timeout);
                            try {
                                let fullText = "";
                                
                                // Extract text from all pages
                                if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
                                    for (const page of pdfData.Pages) {
                                        if (page.Texts && Array.isArray(page.Texts)) {
                                            for (const text of page.Texts) {
                                                if (text.R && Array.isArray(text.R)) {
                                                    for (const run of text.R) {
                                                        if (run.T) {
                                                            // Decode URI-encoded text
                                                            try {
                                                                fullText += decodeURIComponent(run.T) + " ";
                                                            } catch {
                                                                // If decode fails, use the text as-is
                                                                fullText += run.T + " ";
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            fullText += "\n";
                                        }
                                    }
                                }
                                
                                if (!fullText || fullText.trim().length === 0) {
                                    reject(new Error("PDF appears to be empty or contains no extractable text"));
                                } else {
                                    resolve(fullText.trim());
                                }
                            } catch (parseError) {
                                reject(new Error(`Failed to extract text from PDF: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
                            }
                        });
                        
                        // Parse the buffer
                        pdfParser.parseBuffer(buffer);
                    });
                } catch (fallbackError) {
                    // If fallback also fails, provide helpful error message
                    const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                    throw new Error(
                        "PDF parsing failed due to file structure issues (bad XRef entry). " +
                        "This may happen with certain PDF formats. " +
                        "Please try: 1) Re-saving the PDF in a different application, " +
                        "2) Converting to DOCX or TXT format, or 3) Using a different PDF file. " +
                        `Technical details: ${errorMessage}. Fallback error: ${fallbackErrorMsg}`
                    );
                }
            } else if (errorMessage.includes("password") || errorMessage.includes("encrypted")) {
                throw new Error("This PDF appears to be password-protected or encrypted. Please remove the password and try again.");
            } else {
                throw new Error(`Failed to parse PDF. The file may be corrupted or in an unsupported format: ${errorMessage}`);
            }
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

    // Handle different response formats - ensure we always return a string
    let answer: string;
    if (typeof response === 'string') {
        answer = response;
    } else {
        const content = response.content;
        if (typeof content === 'string') {
            answer = content;
        } else if (Array.isArray(content)) {
            answer = content.map(part => {
                if (typeof part === 'string') return part;
                if (typeof part === 'object' && part !== null && 'text' in part) {
                    return String(part.text);
                }
                return '';
            }).join('');
        } else {
            answer = String(content) || JSON.stringify(response);
        }
    }
    return answer;
}
