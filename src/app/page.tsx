'use client';

import { useState } from 'react';
import { DocumentUpload } from './components/DocumentUpload';
import { ChatInterface } from './components/ChatInterface';
import { Header } from './components/Header';

export default function Home() {
  const [uploadedDocument, setUploadedDocument] = useState<File | null>(null);
  const [chatStarted, setChatStarted] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {!chatStarted ? (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Smart Document Bot
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                Upload your document and start asking questions
              </p>
            </div>

            <DocumentUpload
              onDocumentUpload={setUploadedDocument}
              onStartChat={() => setChatStarted(true)}
            />
          </div>
        ) : (
          <ChatInterface
            document={uploadedDocument}
            onNewChat={() => setChatStarted(false)}
          />
        )}
      </main>
    </div>
  );
}
