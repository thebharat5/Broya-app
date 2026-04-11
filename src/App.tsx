/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, useEffect, ErrorInfo, ReactNode } from "react";
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Image as ImageIcon, Sparkles, Loader2, Download, RefreshCw, Key, PlayCircle, X, LogIn, LogOut, Shield, Users, BarChart3, TrendingUp, Search, Plus, Minus } from "lucide-react";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, limit, getDocs } from "firebase/firestore";

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
  const [user, setUser] = useState<FirebaseUser | null>(null);
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
    // Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);

      if (firebaseUser) {
        // Sync with Firestore
        const userRef = doc(db, "users", firebaseUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            const newUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              role: firebaseUser.email === "thebharat555@gmail.com" ? "admin" : "user",
              createdAt: serverTimestamp(),
            };
            await setDoc(userRef, newUser);
            setIsAdmin(newUser.role === "admin");

            // Increment total users in global stats
            const statsRef = doc(db, "stats", "global");
            await setDoc(statsRef, { totalUsers: increment(1) }, { merge: true });
          } else {
            const data = userDoc.data();
            
            // Always check email as fallback and update Firestore if needed
            const isOwnerEmail = firebaseUser.email === "thebharat555@gmail.com";
            if (isOwnerEmail) {
              if (data.role !== "admin") {
                await updateDoc(userRef, { 
                  role: "admin"
                });
                setIsAdmin(true);
              } else {
                setIsAdmin(true);
              }
            } else {
              setIsAdmin(data.role === "admin");
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setIsAdmin(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Admin Data Fetching
  useEffect(() => {
    if (!isAdmin) return;

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
  }, [isAdmin]);

  const handleLogin = async () => {
    try {
      console.log("Attempting login...");
      await signInWithPopup(auth, googleProvider);
      console.log("Login successful");
    } catch (err: any) {
      console.error("Login failed", err);
      alert("Login failed: " + (err.message || "Unknown error") + "\n\nCommon fix: Make sure 'broyaai.space' is added to 'Authorized domains' in your Firebase Console (Authentication -> Settings).");
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

    setIsGenerating(true);
    setGenerationStatus("Analyzing product...");
    setError(null);

    try {
      // Use the user's custom VITE_BROYA_KEY for all their site visitors
      const apiKey = (import.meta as any).env.VITE_BROYA_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "") {
        console.error("API Key is missing from environment");
        throw new Error("API Connection Error: Please add VITE_BROYA_KEY in secrets.");
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      const sourceBase64 = sourceImage.split(",")[1];
      const sourceMimeType = sourceImage.split(";")[0].split(":")[1];

      const parts: any[] = [
        {
          inlineData: {
            data: sourceBase64,
            mimeType: sourceMimeType,
          },
        },
      ];

      setGenerationStatus("Designing background...");
      let prompt = "Create a professional Instagram post for this product. Top view (flat lay) of the product packaging on a vibrant, colourful, and appealing background. Realistic textures, professional lighting, high-end product photography style. The final image should be a complete scene.";

      if (referenceImage) {
        setGenerationStatus("Matching reference style...");
        const refBase64 = referenceImage.split(",")[1];
        const refMimeType = referenceImage.split(";")[0].split(":")[1];
        parts.push({
          inlineData: {
            data: refBase64,
            mimeType: refMimeType,
          },
        });
        prompt = "Create a professional Instagram post for the product in the first image. Use the second image as a STYLE reference. Match the aesthetic, lighting, and background style of the reference image exactly, but featuring the product from the first image.";
      }

      setGenerationStatus("Generating high-res image...");
      const modelName = "gemini-2.5-flash-image";

      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [...parts, { text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
          },
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setGeneratedImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
          foundImage = true;
          
          // Log generation
          if (user) {
            await addDoc(collection(db, "generations"), {
              userId: user.uid,
              model: modelName,
              timestamp: serverTimestamp(),
              type: "free"
            });
            
            // Update global stats
            await setDoc(doc(db, "stats", "global"), { 
              totalGenerations: increment(1),
              totalUsers: increment(0) // Just ensure doc exists
            }, { merge: true });
          }

          break;
        }
      }

      if (!foundImage) {
        throw new Error("No image was generated. Please try again.");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      const errorMessage = err.message || "";
      
      if (errorMessage.includes("Requested entity was not found")) {
        setError("API Key error. Please check your VITE_BROYA_KEY secret.");
      } else if (errorMessage.includes("quota") || errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        setRetryTimer(60);
        setError(
          <div className="space-y-2">
            <p className="font-bold text-red-400">Shared API Limit Reached</p>
            <p className="text-xs leading-relaxed">
              Because this is a "Free Tier" app, it uses a shared Google API key. 
              Other people using this same system have used up the current minute's limit.
            </p>
            <p className="text-[10px] text-neutral-500 font-medium">Please wait 60 seconds and try again. This is a limit set by Google, not the app.</p>
          </div>
        );
      } else {
        setError(errorMessage || "Failed to generate image. Please try again.");
      }
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
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold text-white">{user.displayName}</p>
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
