import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { LucidePlus, LucideCopy, LucideArrowRight, LucideTrophy, LucideUsers, LucideCheck, LucideLoader2, LucideArrowUp, LucideArrowDown, LucideScale, LucideGroup, LucideStar, LucideChevronLeft, LucideCoffee } from 'lucide-react';

// Firebase configuration from the environment.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase and Firestore
let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
}

// Function to generate a random 6-character session code
const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Main App Component
const App = () => {
    const [page, setPage] = useState('home');
    const [sessionCode, setSessionCode] = useState('');
    const [userId, setUserId] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const initializeAuth = async () => {
            if (!auth) {
                console.error("Firebase Auth not initialized.");
                return;
            }
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (e) {
                console.error("Authentication error: ", e);
            }
        };

        const authStateUnsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                setUserId(null);
            }
            setIsAuthReady(true);
        });

        initializeAuth();

        return () => authStateUnsubscribe();
    }, []);

    // Effect to listen for real-time changes in the session data
    useEffect(() => {
        if (!db || !sessionCode || !isAuthReady) return;
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, sessionCode);
        const unsubscribe = onSnapshot(sessionRef, (docSnap) => {
            if (docSnap.exists()) {
                setSessionData(docSnap.data());
                setError('');
            } else {
                setSessionData(null);
                if (page !== 'home') {
                    setError('Session not found.');
                }
            }
        }, (err) => {
            console.error("Failed to listen to session data:", err);
            setError("Failed to load session data.");
        });

        return () => unsubscribe();
    }, [sessionCode, isAuthReady, page]);

    const handleCreateSession = async (title) => {
        if (!db || !userId) {
            setError('Authentication not complete. Please wait.');
            return;
        }
        const newCode = generateSessionCode();
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, newCode);
        const newSessionData = {
            title: title,
            options: [],
            votes: {},
            host: userId,
            isVotingClosed: false,
            winner: null
        };

        try {
            await setDoc(sessionRef, newSessionData);
            setSessionCode(newCode);
            setPage('create-options');
        } catch (e) {
            console.error("Error creating document: ", e);
            setError("Failed to create new session.");
        }
    };

    const handleJoinSession = async (code) => {
        if (!db || !userId) {
            setError('Authentication not complete. Please wait.');
            return;
        }
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, code);
        try {
            const docSnap = await getDoc(sessionRef);
            if (docSnap.exists()) {
                setSessionCode(code);
                setPage('vote');
            } else {
                setError('Session code is invalid.');
            }
        } catch (e) {
            console.error("Error joining session: ", e);
            setError("Failed to join session. Please try again.");
        }
    };

    const renderPage = () => {
        if (!isAuthReady) {
            return (
                <div className="flex items-center justify-center h-screen bg-gray-100">
                    <LucideLoader2 className="animate-spin text-indigo-600 h-10 w-10" />
                    <p className="ml-4 text-lg text-gray-700">Loading...</p>
                </div>
            );
        }

        switch (page) {
            case 'home':
                return <HomePage handleCreateSession={() => setPage('create-session-form')} handleJoinSession={() => setPage('join-session-form')} userId={userId} error={error} />;
            case 'create-session-form':
                return <CreateSessionForm handleCreateSession={handleCreateSession} setPage={setPage} />;
            case 'join-session-form':
                return <JoinSessionForm handleJoinSession={handleJoinSession} setPage={setPage} error={error} />;
            case 'create-options':
                if (!sessionData) return <LoadingScreen message="Creating your session..." />;
                return <CreateOptionsPage sessionCode={sessionCode} sessionData={sessionData} db={db} userId={userId} setPage={setPage} setMessage={setMessage} />;
            case 'vote':
                if (!sessionData) return <LoadingScreen message="Joining session..." />;
                if (sessionData.isVotingClosed) {
                    return <ResultsPage sessionData={sessionData} sessionCode={sessionCode} setPage={setPage} />;
                }
                return <VotingPage sessionCode={sessionCode} sessionData={sessionData} db={db} userId={userId} setPage={setPage} />;
            case 'results':
                if (!sessionData) return <LoadingScreen message="Loading results..." />;
                return <ResultsPage sessionData={sessionData} sessionCode={sessionCode} setPage={setPage} />;
            default:
                return <HomePage handleCreateSession={() => setPage('create-session-form')} handleJoinSession={() => setPage('join-session-form')} userId={userId} error={error} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans text-gray-800 flex flex-col">
            <div className="flex-grow">
                {renderPage()}
            </div>
            {message && <MessageModal message={message} setMessage={setMessage} />}
        </div>
    );
};

// Message Modal Component
const MessageModal = ({ message, setMessage }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            setMessage('');
        }, 3000);
        return () => clearTimeout(timer);
    }, [message, setMessage]);

    return (
        <div className="fixed bottom-4 right-4 p-4 bg-gray-800 text-white rounded-lg shadow-xl z-50 transition-transform transform duration-300 ease-out animate-fade-in-up">
            {message}
        </div>
    );
};


// Home Page Component
const HomePage = ({ handleCreateSession, handleJoinSession, userId, error }) => {
    return (
        <div className="flex flex-col items-center min-h-screen p-4 bg-gradient-to-br from-indigo-500 to-purple-600">
            <header className="text-center text-white mt-12 mb-12">
                <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-2">RankVote</h1>
                <p className="text-lg md:text-xl font-light max-w-2xl mx-auto">Make group decisions easier with ranked choice voting. Perfect for choosing restaurants, movies, or destinations.</p>
            </header>

            {error && (
                <div className="bg-red-500 text-white p-3 rounded-lg mb-4 text-center">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center text-center transition-all duration-300 hover:scale-105">
                    <LucidePlus className="h-12 w-12 text-indigo-500 mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Create Session</h2>
                    <p className="text-gray-600 mb-6">Start a new ranked choice decision for your group.</p>
                    <button
                        onClick={handleCreateSession}
                        className="w-full py-3 px-6 bg-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:bg-indigo-700 transition-colors duration-300 transform active:scale-95"
                    >
                        Get Started
                    </button>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center text-center transition-all duration-300 hover:scale-105">
                    <LucideArrowRight className="h-12 w-12 text-purple-500 mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Join Session</h2>
                    <p className="text-gray-600 mb-6">Enter a session code to participate in a group decision.</p>
                    <button
                        onClick={handleJoinSession}
                        className="w-full py-3 px-6 bg-purple-600 text-white font-semibold rounded-xl shadow-lg hover:bg-purple-700 transition-colors duration-300 transform active:scale-95"
                    >
                        Join Now
                    </button>
                </div>
            </div>

            <div className="mt-12 w-full max-w-4xl">
                <h2 className="text-3xl font-bold text-center text-white mb-6">Why Ranked Choice Voting?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-white">
                    <div className="bg-white/20 p-6 rounded-xl backdrop-blur-sm">
                        <LucideScale className="h-10 w-10 text-white mx-auto mb-2" />
                        <h3 className="text-xl font-bold mb-1">Fair & Democratic</h3>
                        <p className="text-sm font-light">Everyone's preferences matter. No more settling for second-best choices.</p>
                    </div>
                    <div className="bg-white/20 p-6 rounded-xl backdrop-blur-sm">
                        <LucideUsers className="h-10 w-10 text-white mx-auto mb-2" />
                        <h3 className="text-xl font-bold mb-1">Group Friendly</h3>
                        <p className="text-sm font-light">Up to 10 participants can vote on up to 10 different options.</p>
                    </div>
                    <div className="bg-white/20 p-6 rounded-xl backdrop-blur-sm">
                        <LucideStar className="h-10 w-10 text-white mx-auto mb-2" />
                        <h3 className="text-xl font-bold mb-1">Clear Winner</h3>
                        <p className="text-sm font-light">Mathematical certainty ensures the group's true preference wins.</p>
                    </div>
                </div>
            </div>
            
            <div className="mt-12 w-full max-w-4xl">
                <h2 className="text-3xl font-bold text-center text-white mb-6">How It Works</h2>
                <div className="flex flex-col sm:flex-row justify-between items-start space-y-8 sm:space-y-0 sm:space-x-8 text-center text-white">
                    <div className="flex-1 flex flex-col items-center">
                        <div className="bg-white/20 rounded-full h-12 w-12 flex items-center justify-center text-xl font-bold mb-2">1</div>
                        <p className="font-light">Create a session and add your choices</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                        <div className="bg-white/20 rounded-full h-12 w-12 flex items-center justify-center text-xl font-bold mb-2">2</div>
                        <p className="font-light">Share the session code with your group</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                        <div className="bg-white/20 rounded-full h-12 w-12 flex items-center justify-center text-xl font-bold mb-2">3</div>
                        <p className="font-light">Everyone ranks their preferences by using up/down arrows</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                        <div className="bg-white/20 rounded-full h-12 w-12 flex items-center justify-center text-xl font-bold mb-2">4</div>
                        <p className="font-light">View the winner determined by ranked choice voting</p>
                    </div>
                </div>
            </div>

            <div className="mt-12 text-center text-white">
                <p className="text-sm font-light">Your User ID: <span className="font-mono">{userId || 'Loading...'}</span></p>
                <p className="text-sm font-light mt-2">This is important for other users to find you.</p>
            </div>
            <Footer />
        </div>
    );
};

// Create Session Form Page
const CreateSessionForm = ({ handleCreateSession, setPage }) => {
    const [sessionTitle, setSessionTitle] = useState('');
    const handleCreateClick = (e) => {
        e.preventDefault();
        if (sessionTitle.trim() !== '') {
            handleCreateSession(sessionTitle.trim());
        }
    };
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50">
            <div className="w-full max-w-xl bg-white p-8 rounded-2xl shadow-xl">
                <button onClick={() => setPage('home')} className="flex items-center text-indigo-600 mb-6 transition-colors hover:text-indigo-800">
                    <LucideChevronLeft className="h-4 w-4 mr-1" />
                    Back to Home
                </button>
                <h2 className="text-3xl font-bold text-indigo-700 mb-2">Create Voting Session</h2>
                <p className="text-gray-600 mb-6">Set up a new ranked choice decision for your group.</p>
                <form onSubmit={handleCreateClick}>
                    <label htmlFor="session-title" className="block text-lg font-semibold text-gray-700 mb-2">What are you deciding?</label>
                    <input
                        id="session-title"
                        type="text"
                        value={sessionTitle}
                        onChange={(e) => setSessionTitle(e.target.value)}
                        placeholder="e.g., Where should we go for dinner?"
                        className="w-full p-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-400 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={sessionTitle.trim() === ''}
                        className="w-full mt-6 py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 transform active:scale-95"
                    >
                        Create Session
                    </button>
                </form>
            </div>
            <Footer />
        </div>
    );
};

// Join Session Form Page
const JoinSessionForm = ({ handleJoinSession, setPage, error }) => {
    const [joinCode, setJoinCode] = useState('');
    const handleJoinClick = (e) => {
        e.preventDefault();
        handleJoinSession(joinCode.toUpperCase());
    };
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50">
            <div className="w-full max-w-xl bg-white p-8 rounded-2xl shadow-xl">
                <button onClick={() => setPage('home')} className="flex items-center text-indigo-600 mb-6 transition-colors hover:text-indigo-800">
                    <LucideChevronLeft className="h-4 w-4 mr-1" />
                    Back to Home
                </button>
                <h2 className="text-3xl font-bold text-indigo-700 mb-2">Join Voting Session</h2>
                <p className="text-gray-600 mb-6">Enter the session code to participate in the decision.</p>
                {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
                <form onSubmit={handleJoinClick}>
                    <label htmlFor="session-code" className="block text-lg font-semibold text-gray-700 mb-2">Session Code</label>
                    <input
                        id="session-code"
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        className="w-full p-3 mb-4 text-center border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-400 transition-colors uppercase"
                        maxLength="6"
                    />
                    <button
                        type="submit"
                        disabled={joinCode.trim().length !== 6}
                        className="w-full py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 transform active:scale-95"
                    >
                        Join Session
                    </button>
                </form>
            </div>
            <Footer />
        </div>
    );
};

// Create Options Page
const CreateOptionsPage = ({ sessionCode, sessionData, db, userId, setPage, setMessage }) => {
    const [newOption, setNewOption] = useState('');
    const [options, setOptions] = useState(sessionData.options || []);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleAddOption = async () => {
        if (newOption.trim() === '') return;
        if (options.length >= 10) {
            setError('You can only add up to 10 options.');
            return;
        }

        setIsSubmitting(true);
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, sessionCode);
        try {
            await updateDoc(sessionRef, {
                options: arrayUnion(newOption.trim())
            });
            setNewOption('');
            setOptions([...options, newOption.trim()]);
        } catch (e) {
            console.error("Error adding option: ", e);
            setError('Failed to add option.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStartVoting = () => {
        if (options.length < 2) {
            setError('You need at least two options to start voting.');
            return;
        }
        setPage('vote');
    };

    const handleCopyCode = () => {
        try {
            const tempInput = document.createElement('input');
            tempInput.value = sessionCode;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            setMessage('Session code copied to clipboard!');
        } catch (e) {
            console.error("Failed to copy text: ", e);
            setMessage('Failed to copy session code.');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50">
            <div className="w-full max-w-xl bg-white p-8 rounded-2xl shadow-xl">
                <button onClick={() => setPage('home')} className="flex items-center text-indigo-600 mb-6 transition-colors hover:text-indigo-800">
                    <LucideChevronLeft className="h-4 w-4 mr-1" />
                    Back to Home
                </button>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold text-indigo-700">Add Choices</h2>
                    <div className="flex items-center bg-indigo-100 rounded-full px-4 py-2">
                        <span className="text-sm text-indigo-700 font-semibold mr-2">Session:</span>
                        <span className="text-lg font-bold text-indigo-900">{sessionCode}</span>
                        <button onClick={handleCopyCode} className="ml-2 p-1 text-indigo-700 hover:text-indigo-900 transition-colors">
                            <LucideCopy className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <p className="text-gray-600 mb-6">Add the choices for your group to rank. You can add up to 10 options.</p>

                {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>}

                <div className="flex items-center justify-between mb-2">
                    <label className="text-lg font-semibold text-gray-700">Choices ({options.length}/10)</label>
                    <button
                        onClick={handleAddOption}
                        disabled={isSubmitting || newOption.trim() === '' || options.length >= 10}
                        className="py-2 px-4 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 flex items-center"
                    >
                        <LucidePlus className="h-4 w-4 mr-2" /> Add Choice
                    </button>
                </div>
                
                <div className="flex mb-6">
                    <input
                        type="text"
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        placeholder="e.g., Mexican"
                        className="flex-1 p-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-400"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') handleAddOption();
                        }}
                    />
                </div>

                <ul className="space-y-3 mb-6">
                    {options.map((option, index) => (
                        <li key={index} className="flex items-center bg-gray-100 p-4 rounded-xl border border-gray-200">
                            <span className="text-gray-700 font-medium">{option}</span>
                        </li>
                    ))}
                </ul>
                
                {options.length > 1 && (
                    <button
                        onClick={handleStartVoting}
                        className="w-full py-4 bg-green-500 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-green-600 transition-colors"
                    >
                        Start Voting
                    </button>
                )}
            </div>
            <Footer />
        </div>
    );
};

// Voting Page
const VotingPage = ({ sessionCode, sessionData, db, userId, setPage }) => {
    const [options, setOptions] = useState(sessionData.options || []);
    const [hasVoted, setHasVoted] = useState(!!sessionData.votes[userId]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleMoveUp = (index) => {
        if (index === 0) return;
        const newOptions = [...options];
        const temp = newOptions[index];
        newOptions[index] = newOptions[index - 1];
        newOptions[index - 1] = temp;
        setOptions(newOptions);
    };

    const handleMoveDown = (index) => {
        if (index === options.length - 1) return;
        const newOptions = [...options];
        const temp = newOptions[index];
        newOptions[index] = newOptions[index + 1];
        newOptions[index + 1] = temp;
        setOptions(newOptions);
    };

    const handleSubmitVote = async () => {
        if (!options.length) {
            setError('There are no options to vote on.');
            return;
        }
        setIsSubmitting(true);
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, sessionCode);
        try {
            await updateDoc(sessionRef, {
                [`votes.${userId}`]: options
            });
            setHasVoted(true);
        } catch (e) {
            console.error("Error submitting vote: ", e);
            setError('Failed to submit vote. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseVoting = async () => {
        if (!db || !sessionData) return;
        const sessionRef = doc(db, `/artifacts/${appId}/public/data/sessions`, sessionCode);
        const allVotes = Object.values(sessionData.votes);

        if (allVotes.length === 0) {
            setError("Cannot close voting with no votes.");
            return;
        }

        const rankedChoiceWinner = calculateRankedChoiceWinner(sessionData.options, allVotes);
        
        try {
            await updateDoc(sessionRef, {
                isVotingClosed: true,
                winner: rankedChoiceWinner,
            });
        } catch (e) {
            console.error("Error closing voting: ", e);
            setError('Failed to close voting.');
        }
    };

    const participantsCount = Object.keys(sessionData.votes).length;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50">
            <div className="w-full max-w-xl bg-white p-8 rounded-2xl shadow-xl">
                <button onClick={() => setPage('home')} className="flex items-center text-indigo-600 mb-6 transition-colors hover:text-indigo-800">
                    <LucideChevronLeft className="h-4 w-4 mr-1" />
                    Back to Home
                </button>
                <h2 className="text-3xl font-bold text-indigo-700 mb-2">{sessionData.title || 'Voting Session'}</h2>
                <p className="text-gray-600 mb-6">Drag and drop the choices to rank them from most preferred (top) to least preferred (bottom)</p>
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-light text-gray-500">
                        Session: <span className="font-mono font-semibold text-indigo-700">{sessionCode}</span>
                    </p>
                    <div className="flex items-center space-x-1 text-gray-600">
                        <LucideUsers className="h-4 w-4" />
                        <span className="text-sm font-medium">{participantsCount} Participants</span>
                    </div>
                </div>

                {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>}

                <h3 className="text-xl font-bold text-gray-700 mb-4">Rank Your Choices</h3>
                <p className="text-sm text-gray-500 mb-6">Your #1 choice should be at the top. Use arrow buttons to reorder.</p>

                {hasVoted ? (
                    <div className="text-center">
                        <LucideCheck className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-green-700 mb-2">Thank you for voting!</h3>
                        <p className="text-gray-600">Your vote has been submitted. Waiting for others to finish.</p>
                    </div>
                ) : (
                    <ul className="space-y-3 mb-6">
                        {options.map((option, index) => (
                            <li
                                key={option}
                                className="flex items-center p-4 bg-indigo-100 rounded-xl shadow-sm border border-indigo-200"
                            >
                                <span className="font-bold text-indigo-700 mr-4">{index + 1}.</span>
                                <span className="text-lg font-medium text-indigo-900 flex-grow">{option}</span>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => handleMoveUp(index)}
                                        disabled={index === 0}
                                        className="p-2 bg-indigo-200 rounded-full hover:bg-indigo-300 disabled:opacity-50"
                                    >
                                        <LucideArrowUp className="h-4 w-4 text-indigo-700" />
                                    </button>
                                    <button
                                        onClick={() => handleMoveDown(index)}
                                        disabled={index === options.length - 1}
                                        className="p-2 bg-indigo-200 rounded-full hover:bg-indigo-300 disabled:opacity-50"
                                    >
                                        <LucideArrowDown className="h-4 w-4 text-indigo-700" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {!hasVoted && (
                    <button
                        onClick={handleSubmitVote}
                        disabled={isSubmitting}
                        className="w-full py-4 bg-green-500 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-green-600 transition-colors disabled:bg-green-300"
                    >
                        Submit My Rankings
                    </button>
                )}

                {sessionData.host === userId && Object.keys(sessionData.votes).length > 0 && (
                    <button
                        onClick={handleCloseVoting}
                        className="w-full mt-4 py-3 bg-red-500 text-white font-semibold rounded-xl shadow-md hover:bg-red-600 transition-colors"
                    >
                        Close Voting & View Results
                    </button>
                )}
            </div>
            <Footer />
        </div>
    );
};

// Results Page
const ResultsPage = ({ sessionData, sessionCode, setPage }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50">
            <div className="w-full max-w-xl bg-white p-8 rounded-2xl shadow-xl text-center">
                <button onClick={() => setPage('home')} className="flex items-center text-indigo-600 mb-6 transition-colors hover:text-indigo-800">
                    <LucideChevronLeft className="h-4 w-4 mr-1" />
                    Back to Home
                </button>
                <h2 className="text-4xl font-bold text-green-700 mb-2">The Winner Is...</h2>
                <LucideTrophy className="h-24 w-24 text-yellow-500 mx-auto my-6" />
                <p className="text-5xl font-extrabold text-gray-900 mb-6">{sessionData.winner}</p>
                <div className="bg-gray-100 p-4 rounded-lg inline-block">
                    <p className="text-sm font-semibold text-gray-500">Session Code</p>
                    <p className="text-xl font-bold text-gray-700">{sessionCode}</p>
                </div>
            </div>
            <Footer />
        </div>
    );
};

// Simple Loading Screen
const LoadingScreen = ({ message }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <LucideLoader2 className="animate-spin text-indigo-600 h-10 w-10" />
        <p className="ml-4 text-lg text-gray-700 mt-4">{message}</p>
    </div>
);

// Footer Component
const Footer = () => (
    <footer className="w-full text-center py-6 text-gray-600">
        <p className="text-sm font-light">
            Made by Ram Yanamandra in NJ
        </p>
        <a href="#" className="flex items-center justify-center mt-2 text-sm text-yellow-600 hover:text-yellow-700">
            <LucideCoffee className="h-4 w-4 mr-1" />
            Buy me a coffee
        </a>
    </footer>
);

// Helper function for ranked-choice voting (instant runoff)
const calculateRankedChoiceWinner = (options, allVotes) => {
    if (allVotes.length === 0) return 'No votes submitted yet.';

    let currentOptions = [...options];

    while (true) {
        if (currentOptions.length === 1) {
            return currentOptions[0];
        }

        const firstPlaceVotes = {};
        currentOptions.forEach(option => firstPlaceVotes[option] = 0);

        allVotes.forEach(vote => {
            const firstChoice = vote.find(choice => currentOptions.includes(choice));
            if (firstChoice) {
                firstPlaceVotes[firstChoice]++;
            }
        });

        const totalVotes = allVotes.length;
        const majorityThreshold = totalVotes / 2;

        let winner = null;
        for (const option of currentOptions) {
            if (firstPlaceVotes[option] > majorityThreshold) {
                winner = option;
                break;
            }
        }

        if (winner) {
            return winner;
        }

        const sortedVotes = Object.entries(firstPlaceVotes).sort(([, a], [, b]) => a - b);
        const lowestVoteCount = sortedVotes[0][1];
        const eliminatedOptions = sortedVotes.filter(([, count]) => count === lowestVoteCount).map(([option]) => option);

        currentOptions = currentOptions.filter(option => !eliminatedOptions.includes(option));

        if (currentOptions.length === 0) {
            return eliminatedOptions[0];
        }
    }
};

export default App;
