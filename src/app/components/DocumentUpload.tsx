'use client';

import { useState, useRef } from 'react';
import { handlePdfUpload } from '../actions';

interface DocumentUploadProps {
    onDocumentUpload: (file: File) => void;
    onStartChat: () => void;
}

export function DocumentUpload({ onDocumentUpload, onStartChat }: DocumentUploadProps) {
    const [dragActive, setDragActive] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (file: File) => {
        // Check file type
        const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please upload a PDF, TXT, or DOCX file');
            return;
        }

        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            alert('File size must be less than 10MB');
            return;
        }

        setUploadedFile(file);
        onDocumentUpload(file);
    };

    const onButtonClick = () => {
        fileInputRef.current?.click();
    };

    const startChat = async () => {
        if (uploadedFile) {
            setIsUploading(true);
            setUploadError(null);

            try {
                // Upload and process the PDF
                const formData = new FormData();
                formData.append("file", uploadedFile);
                const result = await handlePdfUpload(formData);

                if (result === "Document uploaded and processed successfully!") {
                    onStartChat();
                } else {
                    setUploadError(result || "Failed to process document");
                }
            } catch (error) {
                console.error("Upload error:", error);
                setUploadError("Failed to upload document. Please try again.");
            } finally {
                setIsUploading(false);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div
                className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.txt,.docx"
                    onChange={handleChange}
                />

                <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>

                    <div>
                        <p className="text-lg font-medium text-gray-900 dark:text-white">
                            Drop your document here
                        </p>
                        <p className="text-gray-600 dark:text-gray-300">
                            or{' '}
                            <button
                                onClick={onButtonClick}
                                className="text-blue-600 hover:text-blue-500 font-medium"
                            >
                                browse files
                            </button>
                        </p>
                    </div>

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Supports PDF, TXT, and DOCX files up to 10MB
                    </p>
                </div>
            </div>

            {uploadedFile && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                    {uploadedFile.name}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={startChat}
                            disabled={isUploading}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
                        >
                            {isUploading ? 'Processing...' : 'Start Chat'}
                        </button>
                    </div>
                </div>
            )}

            {uploadError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400 px-4 py-3 rounded-lg">
                    <p className="font-medium">Upload Error</p>
                    <p className="text-sm mt-1">{uploadError}</p>
                </div>
            )}
        </div>
    );
}
