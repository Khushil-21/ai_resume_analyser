import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { usePuterStore } from "~/lib/puter";
import Navbar from "~/components/Navbar";
import type { Route } from "./+types/wipe";

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
            const parsedResumes = resumeKVItems?.map((item) => {
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
            });
            setResumes(parsedResumes || []);
        } catch (error) {
            console.error("Error loading resumes:", error);
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
            if (!resume) return;

            // Delete from KV store
            await kv.del(`resume:${resumeId}`);
            
            // Delete files
            try {
                await fs.delete(resume.imagePath);
                await fs.delete(resume.resumePath);
            } catch (fileError) {
                console.warn("Error deleting files:", fileError);
            }

            await loadResumes();
            setShowConfirmDialog(false);
            setResumeToDelete(null);
        } catch (error) {
            console.error("Error deleting resume:", error);
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
                await kv.del(`resume:${resumeId}`);
                
                // Delete files
                try {
                    await fs.delete(resume.imagePath);
                    await fs.delete(resume.resumePath);
                } catch (fileError) {
                    console.warn("Error deleting files:", fileError);
                }
            }

            await loadResumes();
            setSelectedResumes(new Set());
            setShowBulkConfirmDialog(false);
        } catch (error) {
            console.error("Error deleting resumes:", error);
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteAll = async () => {
        setDeleting(true);
        try {
            // Delete all resume KV entries
            await kv.flush();
            
            // Delete all files
            for (const resume of resumes) {
                try {
                    await fs.delete(resume.imagePath);
                    await fs.delete(resume.resumePath);
                } catch (fileError) {
                    console.warn("Error deleting files:", fileError);
                }
            }

            await loadResumes();
            setSelectedResumes(new Set());
            setShowBulkConfirmDialog(false);
        } catch (error) {
            console.error("Error wiping all data:", error);
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

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full max-w-[1850px]">
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-8 max-w-md mx-4">
                        <h3 className="text-2xl font-bold mb-4">Confirm Deletion</h3>
                        <p className="text-dark-200 mb-6">
                            Are you sure you want to delete this resume? This action cannot be undone.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    setResumeToDelete(null);
                                }}
                                disabled={deleting}
                                className="flex-1 border border-gray-300 text-gray-700 rounded-full px-4 py-2 cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteSingle(resumeToDelete)}
                                disabled={deleting}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 cursor-pointer disabled:opacity-50"
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirmation Dialog */}
            {showBulkConfirmDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-8 max-w-md mx-4">
                        <h3 className="text-2xl font-bold mb-4">Confirm Bulk Deletion</h3>
                        <p className="text-dark-200 mb-6">
                            {selectedResumes.size === resumes.length 
                                ? "Are you sure you want to wipe ALL application data? This will permanently delete all resumes and cannot be undone."
                                : `Are you sure you want to delete ${selectedResumes.size} selected resume${selectedResumes.size > 1 ? 's' : ''}? This action cannot be undone.`
                            }
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowBulkConfirmDialog(false)}
                                disabled={deleting}
                                className="flex-1 border border-gray-300 text-gray-700 rounded-full px-4 py-2 cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={selectedResumes.size === resumes.length ? handleDeleteAll : handleDeleteSelected}
                                disabled={deleting}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 cursor-pointer disabled:opacity-50"
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
        <div className={`flex flex-col gap-4 h-[420px] w-full bg-white rounded-2xl p-4 border-2 transition-all ${
            isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent'
        }`}>
            <div className="flex flex-row justify-between items-start">
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {resume.companyName && (
                        <h3 className="font-bold text-lg break-words">{resume.companyName}</h3>
                    )}
                    {resume.jobTitle && (
                        <p className="text-gray-500 break-words">{resume.jobTitle}</p>
                    )}
                    {!resume.companyName && !resume.jobTitle && (
                        <h3 className="font-bold text-lg">Resume</h3>
                    )}
                </div>
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onSelect}
                    className="mt-2 w-5 h-5 text-blue-600 cursor-pointer"
                />
            </div>

            {resumeUrl && (
                <div className="gradient-border flex-1 animate-in fade-in duration-1000">
                    <div className="w-full h-full">
                        <img
                            src={resumeUrl}
                            alt="resume preview"
                            className="w-full h-[250px] object-cover object-top rounded-lg"
                        />
                    </div>
                </div>
            )}

            <button
                onClick={onDelete}
                disabled={deleting}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 cursor-pointer disabled:opacity-50 mt-auto"
            >
                {deleting ? "Deleting..." : "Delete"}
            </button>
        </div>
    );
};

export default WipeApp;
