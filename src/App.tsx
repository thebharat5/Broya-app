/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, useEffect, ErrorInfo, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Image as ImageIcon, Sparkles, Loader2, Download, RefreshCw, Key, PlayCircle, X, LogIn, LogOut, Shield, Users, BarChart3, TrendingUp, Search, Plus, Minus, Coins } from "lucide-react";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "./firebase";
import { signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  declare props: ErrorBoundaryProps;

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) errorMessage = parsed.error;
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
              <X size={40} />
            </div>
            <h2 className="text-2xl font-bold text-white">Application Error</h2>
            <p className="text-neutral-400">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[#9D88FF] text-white rounded-xl font-bold hover:bg-[#8B74FF] transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function BroyaLogo({ size = 24 }: { size?: number }) {
  const [error, setError] = useState(false);
  const logoUrl = "https://lh3.googleusercontent.com/d/18sbufkDifaEidqmhXKhaSwFcG6j_nNyv";

  if (error) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="bg-neutral-900 rounded-xl flex items-center justify-center border border-neutral-800 shadow-inner"
      >
        <div className="text-[#9D88FF] font-black text-xs italic">B</div>
      </div>
    );
  }

  return (
    <img 
      src={logoUrl} 
      alt="Broya Logo" 
      width={size}
      height={size}
      className="object-contain rounded-xl shadow-sm"
      referrerPolicy="no-referrer"
      onLoad={() => console.log("Logo loaded successfully from Google Drive")}
      onError={(e) => {
        console.error("Logo failed to load from Google Drive", e.toString());
        setError(true);
      }}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [showLanding, setShowLanding] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [credits, setCredits] = useState<number>(0);
  const [retryTimer, setRetryTimer] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let interval: any;
    if (retryTimer > 0) {
      interval = setInterval(() => {
        setRetryTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [retryTimer]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [recentGenerations, setRecentGenerations] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [error, setError] = useState<string | ReactNode | null>(null);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [resolution, setResolution] = useState("1K");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setShowLoginModal(false);
    }
  }, [user]);

  const fetchCredits = async (userId: string) => {
    try {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setCredits(docSnap.data().credits_balance || 0);
      } else {
        // Create user doc if it doesn't exist
        await setDoc(docRef, { 
          credits_balance: 10, 
          email: auth.currentUser?.email,
          createdAt: new Date().toISOString()
        });
        setCredits(10);
      }
    } catch (err) {
      console.error("Error fetching credits", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchCredits(currentUser.uid);
        setIsAdmin(currentUser.email === "thebharat555@gmail.com");
      } else {
        setCredits(0);
        setIsAdmin(false);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Admin Data Fetching
  useEffect(() => {
    if (!isAdmin) return;

    /*
    // Admin Stats Listener
    const unsubscribeStats = onSnapshot(doc(db, "stats", "global"), (doc) => {
      setGlobalStats(doc.data());
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "stats/global");
    });

    // Fetch recent generations
    const fetchRecent = async () => {
      try {
        const q = query(collection(db, "generations"), orderBy("timestamp", "desc"), limit(10));
        const snap = await getDocs(q);
        setRecentGenerations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "generations");
      }
    };
    
    // Fetch users list with real-time updates
    const unsubscribeUsers = onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "users");
    });

    fetchRecent();

    return () => {
      unsubscribeStats();
      unsubscribeUsers();
    };
    */
  }, [isAdmin]);

  const handleLogin = () => {
    setShowLoginModal(true);
    setAuthError("");
  };

  const handleGoogleLogin = async () => {
    try {
      setIsAuthLoading(true);
      setAuthError("");
      await signInWithPopup(auth, googleProvider);
      setShowLoginModal(false);
    } catch (err: any) {
      setAuthError(err.message || "Failed to sign in with Google");
      setIsAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError("");
    
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        setShowLoginModal(false);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        setShowLoginModal(false);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowAdminPanel(false);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImage(reader.result as string);
        setGeneratedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
        setGeneratedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const generatePost = async () => {
    if (!sourceImage) {
      setError("Please upload a product photo first.");
      return;
    }

    if (!user) {
      setError(
        <div className="space-y-3">
          <p>Please log in to generate images.</p>
          <button 
            onClick={() => setShowLoginModal(true)}
            className="w-full px-4 py-2 bg-[#9D88FF] text-white rounded-lg text-sm font-bold hover:bg-[#8B74FF] transition-all"
          >
            Log In Now
          </button>
        </div>
      );
      return;
    }

    if (credits <= 0) {
      setError("You don't have enough credits. Please top up or watch an ad.");
      return;
    }

    setIsGenerating(true);
    setGenerationStatus("Analyzing product...");
    setError(null);

    try {
      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
      }

      setGenerationStatus("Designing background...");
      let prompt = "Create a professional Instagram post for this product. Top view (flat lay) of the product packaging on a vibrant, colourful, and appealing background. Realistic textures, professional lighting, high-end product photography style. The final image should be a complete scene.";

      if (referenceImage) {
        setGenerationStatus("Matching reference style...");
        prompt = "Create a professional Instagram post for the product in the first image. Use the second image as a STYLE reference. Match the aesthetic, lighting, and background style of the reference image exactly, but featuring the product from the first image.";
      }

      setGenerationStatus("Generating high-res image...");
      
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio, token }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          throw new Error("Backend server is not reachable. If you just made changes, please wait a minute for the deployment to finish, or deploy the app again.");
        }
        
        let errorMessage = errorData.error || "Failed to generate image.";
        
        if (response.status === 402) {
          setError(
            <div className="space-y-2">
              <p className="font-bold text-red-400">Insufficient Credits</p>
              <p className="text-xs leading-relaxed">{errorMessage}</p>
            </div>
          );
          return;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (data.imageUrl) {
        setGeneratedImage(data.imageUrl);
        // Refresh credits after successful generation
        fetchCredits(user.id);
      } else {
        throw new Error("No image was generated. Please try again.");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      const errorMessage = err.message || "Failed to generate image. Please try again.";
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = "insta-post.png";
    link.click();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-[#9D88FF]/30">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BroyaLogo size={48} />
            <h1 className="text-xl font-bold tracking-tight">Broya</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <button 
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showAdminPanel ? 'bg-[#9D88FF] text-white' : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white'}`}
              >
                <Shield size={16} />
                Admin Panel
              </button>
            )}
            
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg">
                  <Coins size={16} className="text-yellow-500" />
                  <span className="text-sm font-bold text-white">{credits} Credits</span>
                </div>
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold text-white">{user.user_metadata?.full_name || user.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-neutral-500">{user.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-[#9D88FF] text-white rounded-xl text-sm font-bold hover:bg-[#8B74FF] transition-all shadow-lg shadow-[#9D88FF]/20"
              >
                <LogIn size={18} />
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {showAdminPanel && isAdmin ? (
        <AdminDashboard 
          stats={globalStats} 
          generations={recentGenerations} 
          users={allUsers}
          onClose={() => setShowAdminPanel(false)} 
          currentUser={user}
        />
      ) : showLanding ? (
        <LandingPage onStart={() => {
          setShowLanding(false);
          window.scrollTo(0, 0);
        }} />
      ) : (
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* Horizontal Ad Placeholder */}
          <div className="w-full h-52 bg-neutral-900 border border-neutral-800 rounded-2xl mb-8 flex items-center justify-center text-neutral-600 text-sm font-medium overflow-hidden relative">
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] uppercase tracking-wider">Advertisement</div>
            Horizontal Ad Space (728x200)
          </div>

          <div className="grid lg:grid-cols-[1fr_1fr_160px] gap-8 items-start">
            
            {/* Left Column: Upload & Controls */}
            <section className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-white">
                  Transform your product into a masterpiece
                </h2>
                <p className="text-neutral-400 leading-relaxed">
                  Upload your product photo and let AI generate a professional, high-converting Instagram post.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Main Product Upload */}
                <div className="space-y-4">
                  <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">1. Product Photo</p>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      aspect-square rounded-3xl border-2 border-dashed transition-all cursor-pointer group relative overflow-hidden
                      ${sourceImage ? 'border-[#9D88FF]/50 bg-[#9D88FF]/5' : 'border-neutral-800 bg-neutral-900/50 hover:border-[#9D88FF]/30 hover:bg-neutral-900'}
                    `}
                  >
                    {sourceImage ? (
                      <>
                        <img src={sourceImage} alt="Source" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <RefreshCw className="text-white" size={32} />
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                        <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Upload className="text-[#9D88FF]" size={28} />
                        </div>
                        <div>
                          <p className="text-white font-bold">Upload Product</p>
                          <p className="text-xs text-neutral-500 mt-1">PNG, JPG or WEBP</p>
                        </div>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                </div>

                {/* Reference Style Upload */}
                <div className="space-y-4">
                  <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">2. Style Reference (Optional)</p>
                  <div 
                    onClick={() => referenceFileInputRef.current?.click()}
                    className={`
                      aspect-square rounded-3xl border-2 border-dashed transition-all cursor-pointer group relative overflow-hidden
                      ${referenceImage ? 'border-amber-500/50 bg-amber-500/5' : 'border-neutral-800 bg-neutral-900/50 hover:border-amber-500/30 hover:bg-neutral-900'}
                    `}
                  >
                    {referenceImage ? (
                      <>
                        <img src={referenceImage} alt="Reference" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <RefreshCw className="text-white" size={32} />
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setReferenceImage(null);
                          }}
                          className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-red-500 rounded-lg text-white transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                        <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Plus className="text-amber-500" size={28} />
                        </div>
                        <div>
                          <p className="text-white font-bold">Add Reference</p>
                          <p className="text-xs text-neutral-500 mt-1">Match a specific vibe</p>
                        </div>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={referenceFileInputRef} 
                      onChange={handleReferenceImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Aspect Ratio</p>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full bg-transparent border-none text-white font-semibold focus:ring-0 cursor-pointer outline-none"
                  >
                    <option value="1:1" className="bg-neutral-900">1:1 Square</option>
                    <option value="3:4" className="bg-neutral-900">3:4 Portrait</option>
                    <option value="4:3" className="bg-neutral-900">4:3 Landscape</option>
                    <option value="9:16" className="bg-neutral-900">9:16 Story</option>
                    <option value="16:9" className="bg-neutral-900">16:9 Cinematic</option>
                  </select>
                </div>
                <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Resolution</p>
                  <select 
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full bg-transparent border-none text-white font-semibold focus:ring-0 outline-none cursor-pointer"
                  >
                    <option value="Standard" className="bg-neutral-900">Standard</option>
                  </select>
                </div>
              </div>

              <button
                onClick={generatePost}
                disabled={isGenerating || !sourceImage}
                className={`
                  w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3
                  ${isGenerating || !sourceImage 
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                    : 'bg-[#9D88FF] text-white hover:bg-[#8B74FF] shadow-lg shadow-[#9D88FF]/20 active:scale-[0.98]'}
                `}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin" size={24} />
                    Generating Magic...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Generate Instagram Post
                  </>
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-sm">
                  {error}
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Result */}
          <section className="relative">
            <div className="sticky top-32 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                  <ImageIcon size={20} className="text-[#9D88FF]" />
                  Preview
                </h3>
                {generatedImage && (
                  <button 
                    onClick={downloadImage}
                    className="text-[#9D88FF] hover:text-[#8B74FF] text-sm font-semibold flex items-center gap-1"
                  >
                    <Download size={16} />
                    Download
                  </button>
                )}
              </div>

              <div className="aspect-[3/4] max-h-[300px] mx-auto bg-neutral-900 border border-neutral-800 rounded-[2rem] overflow-hidden shadow-2xl relative group">
                <AnimatePresence mode="wait">
                  {generatedImage ? (
                    <motion.img
                      key="result"
                      initial={{ opacity: 0, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={generatedImage}
                      alt="Generated Post"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <motion.div
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 p-12 text-center"
                    >
                      {isGenerating ? (
                        <div className="space-y-4 flex flex-col items-center">
                          <div className="relative">
                            <Loader2 className="animate-spin text-[#9D88FF]" size={48} />
                            <Sparkles className="absolute -top-2 -right-2 text-amber-400 animate-pulse" size={20} />
                          </div>
                          <p className="text-neutral-300 font-medium animate-pulse">{generationStatus || "Crafting your professional post..."}</p>
                          <p className="text-sm text-neutral-500">This usually takes about 10-20 seconds</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto border border-neutral-700">
                            <ImageIcon size={32} />
                          </div>
                          <p className="font-medium text-neutral-300">Your generated post will appear here</p>
                          <p className="text-sm">Upload a product photo and hit generate to see the magic happen.</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {generatedImage && (
                <div className="flex gap-3">
                  <button
                    onClick={generatePost}
                    className="flex-1 py-3 bg-neutral-900 border border-neutral-800 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors text-white"
                  >
                    <RefreshCw size={18} />
                    Regenerate
                  </button>
                  <button
                    onClick={downloadImage}
                    className="flex-1 py-3 bg-[#9D88FF] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#8B74FF] transition-colors shadow-lg shadow-[#9D88FF]/10"
                  >
                    <Download size={18} />
                    Save to Device
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Vertical Ad Placeholder */}
          <aside className="hidden lg:block sticky top-32 w-40 h-[600px] bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center text-neutral-600 text-sm font-medium overflow-hidden relative">
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] uppercase tracking-wider">Advertisement</div>
            <div className="rotate-90 whitespace-nowrap">Vertical Ad Space (160x600)</div>
          </aside>
        </div>
      </main>
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-24 py-12 bg-neutral-950">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-4">
          <p className="text-neutral-500 text-sm">
            Copyright © 2026 Broya. All rights reserved.
          </p>
          <div className="flex justify-center gap-6 text-neutral-800">
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            >
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  <BroyaLogo size={48} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {isSignUp ? "Create an Account" : "Welcome Back"}
                </h2>
                <p className="text-neutral-400 text-sm">
                  {isSignUp ? "Sign up to start generating stunning product photos." : "Sign in to continue generating product photos."}
                </p>
              </div>

              {authError && (
                <div className={`p-3 rounded-lg mb-4 text-sm font-medium ${authError.includes("Check your email") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                  {authError}
                </div>
              )}

              <button
                onClick={handleGoogleLogin}
                disabled={isAuthLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-black rounded-xl font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-neutral-800"></div>
                <span className="text-xs text-neutral-500 font-medium">OR</span>
                <div className="flex-1 h-px bg-neutral-800"></div>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#9D88FF] transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#9D88FF] transition-colors"
                    placeholder="••••••••"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full py-3 bg-[#9D88FF] text-white rounded-xl font-bold hover:bg-[#8B74FF] transition-colors disabled:opacity-50 flex justify-center items-center"
                >
                  {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? "Sign Up" : "Sign In")}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-neutral-400">
                  {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setAuthError("");
                    }}
                    className="text-[#9D88FF] font-bold hover:underline"
                  >
                    {isSignUp ? "Sign In" : "Sign Up"}
                  </button>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminDashboard({ stats, generations, users, onClose, currentUser }: { stats: any, generations: any[], users: any[], onClose: () => void, currentUser: any }) {
  const [activeTab, setActiveTab] = useState<'stats' | 'users'>('stats');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = users.filter(u => 
    (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    u.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl md:text-3xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-xs md:text-base text-neutral-400">Business performance and user activity overview.</p>
        </div>
        <div className="flex items-center justify-between md:justify-end gap-3">
          <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            <button 
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === 'stats' ? 'bg-[#9D88FF] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-[#9D88FF] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Users List
            </button>
          </div>
          <button onClick={onClose} className="p-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
      </div>

      {activeTab === 'stats' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatCard icon={<Users className="text-blue-500" />} label="Total Users" value={stats?.totalUsers || 0} trend="+12%" />
            <StatCard icon={<ImageIcon className="text-[#9D88FF]" />} label="Total Images" value={stats?.totalGenerations || 0} trend="+45%" />
          </div>

          <div className="grid lg:grid-cols-1 gap-8">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-[#9D88FF]" />
                  Recent Generations
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
                      <th className="px-6 py-4">User ID</th>
                      <th className="px-6 py-4">Model</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {generations.map((gen) => (
                      <tr key={gen.id} className="text-sm text-neutral-300 hover:bg-neutral-800/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs">{gen.userId.substring(0, 8)}...</td>
                        <td className="px-6 py-4">{gen.model.split('-')[1]}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${gen.type === 'pro' ? 'bg-[#9D88FF]/20 text-[#9D88FF]' : 'bg-neutral-800 text-neutral-500'}`}>
                            {gen.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-neutral-500">{gen.timestamp?.toDate().toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Users size={20} className="text-[#9D88FF]" />
              Registered Users ({filteredUsers.length})
              <span className="text-[10px] font-normal text-neutral-500 ml-2 italic">(Users appear here after their first login)</span>
            </h3>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                <input 
                  type="text"
                  placeholder="Search name, email or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm focus:outline-none focus:border-[#9D88FF] transition-colors"
                />
              </div>
              <button 
                onClick={() => console.log("Searching for:", searchTerm)}
                className="w-full sm:w-auto px-4 py-2 bg-[#9D88FF] text-white rounded-xl text-sm font-bold hover:bg-[#8A75FF] transition-colors flex items-center justify-center gap-2"
              >
                <Search size={16} />
                Search
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="text-sm text-neutral-300 hover:bg-neutral-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{u.displayName || 'Guest'}</td>
                    <td className="px-6 py-4 text-neutral-400">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-neutral-800 text-neutral-500'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-500">
                      {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ icon, label, value, trend }: { icon: ReactNode, label: string, value: string | number, trend: string }) {
  return (
    <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-neutral-950 rounded-xl border border-neutral-800">
          {icon}
        </div>
        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">{trend}</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {
  const row1 = [
    "https://picsum.photos/seed/perfume/600/800",
    "https://picsum.photos/seed/watch/600/800",
    "https://picsum.photos/seed/shoes/600/800",
    "https://picsum.photos/seed/camera/600/800",
    "https://picsum.photos/seed/skincare/600/800",
  ];
  const row2 = [
    "https://picsum.photos/seed/headphones/600/800",
    "https://picsum.photos/seed/bottle/600/800",
    "https://picsum.photos/seed/jewelry/600/800",
    "https://picsum.photos/seed/gadget/600/800",
    "https://picsum.photos/seed/fashion/600/800",
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-start pt-14 pb-12 overflow-hidden bg-neutral-950 relative">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#9D88FF]/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-6xl w-full px-6 text-center space-y-12 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight leading-tight">
            Broya <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#9D88FF] to-purple-400">Your Product, Reimagined.</span>
          </h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Turn simple smartphone photos into high-end studio shots. No expensive gear, no complex lighting—just pure AI magic.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="space-y-2"
        >
          <div className="relative">
            <ScrollingRow images={row1} direction="left" />
            <ScrollingRow images={row2} direction="right" />
            
            {/* Gradient Overlays for smooth edges */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-neutral-950 to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-neutral-950 to-transparent z-10" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="pt-8"
        >
          <button
            onClick={onStart}
            className="group relative px-12 py-5 rounded-2xl font-black text-xl text-white transition-all overflow-hidden"
          >
            {/* Glass Effect Background */}
            <div className="absolute inset-0 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl group-hover:bg-white/20 transition-all" />
            
            {/* Inner Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#9D88FF]/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <span className="relative flex items-center gap-3">
              Start Creating
              <Sparkles className="group-hover:rotate-12 transition-transform" />
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function ScrollingRow({ images, direction = "left" }: { images: string[], direction?: "left" | "right" }) {
  return (
    <div className="flex overflow-hidden gap-0 py-1">
      <motion.div
        animate={{
          x: direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"],
        }}
        transition={{
          duration: 30,
          ease: "linear",
          repeat: Infinity,
        }}
        className="flex gap-0 min-w-max"
      >
        {[...images, ...images].map((src, i) => (
          <div key={i} className="w-32 h-[160px] flex-shrink-0 rounded-none overflow-hidden border border-neutral-800 shadow-xl group relative">
            <img
              src={src}
              alt="Testimonial"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <p className="text-white text-xs font-bold">Generated with AI</p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
