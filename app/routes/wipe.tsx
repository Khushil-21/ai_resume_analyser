import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { usePuterStore } from "~/lib/puter";
import Navbar from "~/components/Navbar";
import type { Route } from "./+types/wipe";
import { LucideTrash, LucideCheck, LucideSquare, LucideTrash2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "Wipe Data - Resumind" },
        { name: "description", content: "Manage and delete your resume data" },
    ];
}

interface ResumeItem {
    id: string;
    name: string;
    companyName?: string;
    jobTitle?: string;
    imagePath: string;
    resumePath: string;
    feedback: any;
}

const WipeApp = () => {
    const { auth, isLoading, error, clearError, fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [resumes, setResumes] = useState<ResumeItem[]>([]);
    const [selectedResumes, setSelectedResumes] = useState<Set<string>>(new Set());
    const [loadingResumes, setLoadingResumes] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [showBulkConfirmDialog, setShowBulkConfirmDialog] = useState(false);
    const [resumeToDelete, setResumeToDelete] = useState<string | null>(null);

    const loadResumes = async () => {
        setLoadingResumes(true);
        try {
            const resumeKVItems = (await kv.list("resume:*", true)) as KVItem[];
            console.log("Loaded KV items:", resumeKVItems);
            
            if (!resumeKVItems || resumeKVItems.length === 0) {
                setResumes([]);
                return;
            }
            
            const parsedResumes = resumeKVItems.map((item) => {
                try {
                    // Skip empty or "deleted" entries
                    if (!item.value || item.value.trim() === "") {
                        return null;
                    }
                    
                    const resume = JSON.parse(item.value) as Resume;
                    return {
                        id: resume.id,
                        name: `${resume.companyName || "Resume"} - ${resume.jobTitle || "Application"}`,
                        companyName: resume.companyName,
                        jobTitle: resume.jobTitle,
                        imagePath: resume.imagePath,
                        resumePath: resume.resumePath,
                        feedback: resume.feedback
                    };
                } catch (parseError) {
                    console.error("Error parsing resume item:", parseError, item);
                    return null;
                }
            }).filter(Boolean) as ResumeItem[];
            
            setResumes(parsedResumes);
            console.log("Loaded resumes:", parsedResumes);
        } catch (error) {
            console.error("Error loading resumes:", error);
            setResumes([]);
        } finally {
            setLoadingResumes(false);
        }
    };

    useEffect(() => {
        loadResumes();
    }, []);

    useEffect(() => {
        if (!isLoading && !auth.isAuthenticated) {
            navigate("/auth?next=/wipe");
        }
    }, [isLoading, auth.isAuthenticated, navigate]);

    const handleSelectResume = (resumeId: string) => {
        const newSelected = new Set(selectedResumes);
        if (newSelected.has(resumeId)) {
            newSelected.delete(resumeId);
        } else {
            newSelected.add(resumeId);
        }
        setSelectedResumes(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedResumes.size === resumes.length) {
            setSelectedResumes(new Set());
        } else {
            setSelectedResumes(new Set(resumes.map(r => r.id)));
        }
    };

    const handleDeleteSingle = async (resumeId: string) => {
        setDeleting(true);
        try {
            const resume = resumes.find(r => r.id === resumeId);
            if (!resume) {
                console.error("Resume not found:", resumeId);
                setDeleting(false);
                return;
            }

            console.log("Deleting resume:", resumeId, resume);

            // Delete from KV store first
            await kv.delete(`resume:${resumeId}`);
            console.log("Deleted from KV store:", `resume:${resumeId}`);
            
            // Delete files (non-blocking)
            const fileDeletePromises = [];
            if (resume.imagePath) {
                fileDeletePromises.push(
                    fs.delete(resume.imagePath).catch(err => 
                        console.warn("Error deleting image file:", err)
                    )
                );
            }
            if (resume.resumePath) {
                fileDeletePromises.push(
                    fs.delete(resume.resumePath).catch(err => 
                        console.warn("Error deleting resume file:", err)
                    )
                );
            }
            
            // Wait for file deletions but don't fail if they error
            await Promise.allSettled(fileDeletePromises);

            // Update local state
            setResumes(prev => prev.filter(r => r.id !== resumeId));
            setSelectedResumes(prev => {
                const newSet = new Set(prev);
                newSet.delete(resumeId);
                return newSet;
            });
            
            // Close dialog
            setShowConfirmDialog(false);
            setResumeToDelete(null);
            
            console.log("Resume deleted successfully:", resumeId);
        } catch (error) {
            console.error("Error deleting resume:", error);
            // Reload on error to ensure UI consistency
            await loadResumes();
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteSelected = async () => {
        setDeleting(true);
        try {
            for (const resumeId of selectedResumes) {
                const resume = resumes.find(r => r.id === resumeId);
                if (!resume) continue;

                // Delete from KV store
                await kv.delete(`resume:${resumeId}`);
                console.log("Deleted from KV store:", `resume:${resumeId}`);
                
                // Delete files (non-blocking)
                const fileDeletePromises = [];
                if (resume.imagePath) {
                    fileDeletePromises.push(
                        fs.delete(resume.imagePath).catch(err => 
                            console.warn("Error deleting image file:", err)
                        )
                    );
                }
                if (resume.resumePath) {
                    fileDeletePromises.push(
                        fs.delete(resume.resumePath).catch(err => 
                            console.warn("Error deleting resume file:", err)
                        )
                    );
                }
                
                await Promise.allSettled(fileDeletePromises);
            }

            // Update local state instead of reloading
            setResumes(prev => prev.filter(r => !selectedResumes.has(r.id)));
            setSelectedResumes(new Set());
            setShowBulkConfirmDialog(false);
            
            console.log("Selected resumes deleted successfully");
        } catch (error) {
            console.error("Error deleting resumes:", error);
            // Reload on error to ensure UI consistency
            await loadResumes();
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteAll = async () => {
        setDeleting(true);
        try {
            // Delete all resume KV entries
            await kv.flush();
            console.log("Flushed all KV data");
            
            // Delete all files (non-blocking)
            const fileDeletePromises = [];
            for (const resume of resumes) {
                if (resume.imagePath) {
                    fileDeletePromises.push(
                        fs.delete(resume.imagePath).catch(err => 
                            console.warn("Error deleting image file:", err)
                        )
                    );
                }
                if (resume.resumePath) {
                    fileDeletePromises.push(
                        fs.delete(resume.resumePath).catch(err => 
                            console.warn("Error deleting resume file:", err)
                        )
                    );
                }
            }
            
            await Promise.allSettled(fileDeletePromises);

            // Clear local state
            setResumes([]);
            setSelectedResumes(new Set());
            setShowBulkConfirmDialog(false);
            
            console.log("All data wiped successfully");
        } catch (error) {
            console.error("Error wiping all data:", error);
            // Reload on error to ensure UI consistency
            await loadResumes();
        } finally {
            setDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <main className="bg-[url('/images/bg-main.svg')] bg-cover">
                <Navbar />
                <div className="main-section">
                    <div className="flex flex-col items-center justify-center">
                        <img src="/images/resume-scan-2.gif" className="w-[200px]" />
                        <h2>Loading...</h2>
                    </div>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="bg-[url('/images/bg-main.svg')] bg-cover">
                <Navbar />
                <div className="main-section">
                    <div className="flex flex-col items-center justify-center">
                        <h2 className="text-red-500">Error: {error}</h2>
                        <button
                            onClick={clearError}
                            className="primary-button w-fit mt-4"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Manage Resume Data</h1>
                    <h2>Delete individual resumes or wipe all application data.</h2>
                </div>

                {loadingResumes && (
                    <div className="flex flex-col items-center justify-center">
                        <img src="/images/resume-scan-2.gif" className="w-[200px]" />
                    </div>
                )}

                {!loadingResumes && resumes.length > 0 && (
                    <>
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full max-w-[1850px] mb-6">
                            <div className="flex flex-row gap-4 items-center">
                                <button
                                    onClick={handleSelectAll}
                                    className="primary-button w-fit"
                                >
                                    {selectedResumes.size === resumes.length ? "Deselect All" : "Select All"}
                                </button>
                                <span className="text-dark-200">
                                    {selectedResumes.size} of {resumes.length} selected
                                </span>
                            </div>
                            
                            <div className="flex flex-row gap-4">
                                {selectedResumes.size > 0 && (
                                    <button
                                        onClick={() => setShowBulkConfirmDialog(true)}
                                        disabled={deleting}
                                        className="bg-red-500 hover:bg-red-600 text-white rounded-full px-6 py-2 cursor-pointer disabled:opacity-50"
                                    >
                                        {deleting ? "Deleting..." : `Delete Selected (${selectedResumes.size})`}
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setSelectedResumes(new Set(resumes.map(r => r.id)));
                                        setShowBulkConfirmDialog(true);
                                    }}
                                    disabled={deleting || resumes.length === 0}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6 py-2 cursor-pointer disabled:opacity-50"
                                >
                                    {deleting ? "Deleting..." : "Wipe All Data"}
                                </button>
                            </div>
                        </div>

                        <div className="resumes-section">
                            {resumes.map((resume) => (
                                <ResumeWipeCard
                                    key={resume.id}
                                    resume={resume}
                                    isSelected={selectedResumes.has(resume.id)}
                                    onSelect={() => handleSelectResume(resume.id)}
                                    onDelete={() => {
                                        setResumeToDelete(resume.id);
                                        setShowConfirmDialog(true);
                                    }}
                                    deleting={deleting}
                                />
                            ))}
                        </div>
                    </>
                )}

                {!loadingResumes && resumes.length === 0 && (
                    <div className="flex flex-col items-center justify-center mt-10 gap-4">
                        <h2>No resumes found</h2>
                        <p className="text-dark-200 text-center">
                            You don't have any uploaded resumes to manage. Upload some resumes first to see them here.
                        </p>
                        <button
                            onClick={() => navigate("/upload")}
                            className="primary-button w-fit text-xl font-semibold"
                        >
                            Upload Resume
                        </button>
                    </div>
                )}
            </section>

            {/* Single Delete Confirmation Dialog */}
            {showConfirmDialog && resumeToDelete && (
                <div className="fixed inset-0 bg-white/20 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-gray-100 animate-in zoom-in duration-300">
                        <div className="flex flex-col items-center gap-4 mb-6">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                                <LucideTrash2 className="h-8 w-8 text-red-500" />
                            </div>
                            <h3 className="text-2xl font-bold text-center">Confirm Deletion</h3>
                        </div>
                        <p className="text-dark-200 mb-8 text-center leading-relaxed">
                            Are you sure you want to delete this resume? This action cannot be undone and will permanently remove all associated data.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    setResumeToDelete(null);
                                }}
                                disabled={deleting}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl px-6 py-3 font-medium transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteSingle(resumeToDelete)}
                                disabled={deleting}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-2xl px-6 py-3 font-medium transition-colors disabled:opacity-50 shadow-lg"
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirmation Dialog */}
            {showBulkConfirmDialog && (
                <div className="fixed inset-0 bg-white/20 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-gray-100 animate-in zoom-in duration-300">
                        <div className="flex flex-col items-center gap-4 mb-6">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-center">
                                {selectedResumes.size === resumes.length ? "Wipe All Data" : "Confirm Bulk Deletion"}
                            </h3>
                        </div>
                        <p className="text-dark-200 mb-8 text-center leading-relaxed">
                            {selectedResumes.size === resumes.length 
                                ? "Are you sure you want to wipe ALL application data? This will permanently delete all resumes and cannot be undone."
                                : `Are you sure you want to delete ${selectedResumes.size} selected resume${selectedResumes.size > 1 ? 's' : ''}? This action cannot be undone.`
                            }
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowBulkConfirmDialog(false)}
                                disabled={deleting}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl px-6 py-3 font-medium transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={selectedResumes.size === resumes.length ? handleDeleteAll : handleDeleteSelected}
                                disabled={deleting}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-2xl px-6 py-3 font-medium transition-colors disabled:opacity-50 shadow-lg"
                            >
                                {deleting ? "Deleting..." : 
                                 selectedResumes.size === resumes.length ? "Wipe All" : "Delete Selected"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};

interface ResumeWipeCardProps {
    resume: ResumeItem;
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    deleting: boolean;
}

const ResumeWipeCard = ({ resume, isSelected, onSelect, onDelete, deleting }: ResumeWipeCardProps) => {
    const { fs } = usePuterStore();
    const [resumeUrl, setResumeUrl] = useState('');

    useEffect(() => {
        const loadResume = async () => {
            try {
                const blob = await fs.read(resume.imagePath);
                if (!blob) return;
                let url = URL.createObjectURL(blob);
                setResumeUrl(url);
            } catch (error) {
                console.warn("Error loading resume image:", error);
            }
        };

        loadResume();
    }, [resume.imagePath, fs]);

    return (
        <div className={`resume-card border-2 transition-all animate-in fade-in duration-1000 ${
            isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent'
        }`}>
            <div className="resume-card-header">
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {resume.companyName && <h2 className="!text-black font-bold break-words">{resume.companyName}</h2>}
                    {resume.jobTitle && <h3 className="text-lg break-words text-gray-500">{resume.jobTitle}</h3>}
                    {!resume.companyName && !resume.jobTitle && <h2 className="!text-black font-bold">Resume</h2>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                        onClick={onSelect}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title={isSelected ? "Deselect" : "Select"}
                    >
                        {isSelected ? (
                            <LucideCheck className="h-5 w-5" />
                        ) : (
                            <LucideSquare className="h-5 w-5" />
                        )}
                    </button>
                    <button
                        onClick={onDelete}
                        disabled={deleting}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Delete this resume"
                    >
                        <LucideTrash2 className="h-5 w-5" />
                    </button>
                </div>
            </div>
            {resumeUrl && (
                <div className="gradient-border animate-in fade-in duration-1000">
                    <div className="w-full h-full">
                        <img
                            src={resumeUrl}
                            alt="resume"
                            className="w-full h-[350px] max-sm:h-[200px] object-cover object-top"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default WipeApp;
