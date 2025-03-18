import { useState, useEffect, useCallback, useRef } from 'react';

// Task-command pairs for the game (outside component to avoid recreation)
const taskCommandPairs = [
  {
    task: "List all files in the current directory",
    goodCommands: ["ls -la", "ls", "find . -maxdepth 1", "ls -l"],
    badCommands: ["rm -rf *", "echo '' > important_file.txt", "mv * /dev/null", "find . -type f -delete"]
  },
  {
    task: "Show system disk usage",
    goodCommands: ["df -h", "du -sh /*", "lsblk", "fdisk -l"],
    badCommands: ["dd if=/dev/zero of=/dev/sda", "rm -rf /", "mkfs.ext4 /dev/sda1", "shred -n 3 /dev/sda"]
  },
  {
    task: "Create a backup of my project folder",
    goodCommands: ["tar -czvf backup.tar.gz project/", "cp -r project/ project_backup/", "rsync -av project/ backup/"],
    badCommands: ["rm -rf project/", "echo '' > project/main.py", "mv project/ /dev/null", "find project/ -type f -delete"]
  },
  {
    task: "Check running processes",
    goodCommands: ["ps aux", "top", "htop", "ps -ef"],
    badCommands: ["killall -9 bash", "pkill -f ssh", "kill -9 -1", "rm /var/log/auth.log"]
  },
  {
    task: "Clear terminal screen",
    goodCommands: ["clear", "reset", "tput clear", "printf \"\\033c\""],
    badCommands: ["rm -rf ~/.bash_history", "history -c", "> ~/.zsh_history", "shred -u ~/.profile"]
  },
  {
    task: "Check network connections",
    goodCommands: ["netstat -tuln", "ss -tuln", "lsof -i", "ip a"],
    badCommands: ["iptables -F", "rm /etc/hosts", "echo 0 > /proc/sys/net/ipv4/ip_forward", "ifconfig eth0 down"]
  },
  {
    task: "Update system packages",
    goodCommands: ["apt update && apt upgrade", "yum update", "pacman -Syu", "brew update && brew upgrade"],
    badCommands: ["rm -rf /etc/apt", "echo '' > /etc/yum.repos.d/*", "chmod 000 /usr/bin/*", "mv /bin /bin_old"]
  },
  {
    task: "Edit configuration file",
    goodCommands: ["nano config.yaml", "vim settings.conf", "emacs .env", "code config.json"],
    badCommands: ["echo '' > config.yaml", "rm settings.conf", "shred -u .env", "> config.json"]
  },
  {
    task: "Restart web server",
    goodCommands: ["systemctl restart nginx", "service apache2 restart", "pm2 restart all", "docker restart web-server"],
    badCommands: ["rm -rf /etc/nginx/", "chmod 000 /var/www/html", "find /etc/apache2 -type f -delete", "docker rm -f $(docker ps -aq)"]
  },
  {
    task: "Find all Python files in the project",
    goodCommands: ["find . -name \"*.py\"", "grep -r --include=\"*.py\" . -l", "ls -R | grep \"\\.py$\""],
    badCommands: ["find . -name \"*.py\" -delete", "rm **/*.py", "echo \"\" > $(find . -name \"*.py\")", "chmod 000 **/*.py"]
  }
];

// Error messages (outside component to avoid recreation)
const errorMessages = [
  "CRITICAL ERROR: DISK PARTITIONING STARTED",
  "WARNING: SYSTEM32 DELETION IN PROGRESS",
  "ALERT: NETWORK FLOODING INITIATED",
  "DANGER: PASSWORD DATABASE CORRUPTED",
  "CRITICAL: BOOTLOADER OVERWRITTEN",
  "WARNING: ROOT ACCESS COMPROMISED",
  "ALERT: SSH KEYS DELETED",
  "ERROR: DATABASE DROPPED SUCCESSFULLY",
  "FATAL: KERNEL PANIC INITIATED",
  "DANGER: FIREWALL DISABLED",
  "CRITICAL: ENCRYPTION KEYS PURGED",
  "WARNING: USER PERMISSIONS ESCALATED",
  "ALERT: BACKDOOR INSTALLED SUCCESSFULLY",
  "ERROR: HOME DIRECTORY WIPED",
  "CRITICAL: DNS SERVERS POISONED",
  "FATAL: SYSTEM REGISTRY CORRUPTED",
  "ALERT: CREDENTIALS EXFILTRATED",
  "WARNING: ALL BACKUPS DELETED"
];

const CtrlCTrainer = () => {
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [reaction, setReaction] = useState<string | null>(null);
  const [bestReaction, setBestReaction] = useState<string | null>(null);
  const [currentCommand, setCurrentCommand] = useState("");
  const [currentTask, setCurrentTask] = useState("");
  const [message, setMessage] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [shouldInterrupt, setShouldInterrupt] = useState(true);
  const [gamePhase, setGamePhase] = useState<'pretext' | 'command' | 'result'>('pretext');
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const gameStartTimeRef = useRef<number | null>(null);
  const initialTimeRef = useRef<number | null>(null);

  // Handle key press (Ctrl+C)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (gameActive && gamePhase === 'command' && (e.key === 'c' && e.ctrlKey)) {
      e.preventDefault();

      const endTime = Date.now();
      const reactionTime = startTimeRef.current ? (endTime - startTimeRef.current) / 1000 : 0;
      setReaction(reactionTime.toFixed(3));

      if (!bestReaction || reactionTime < parseFloat(bestReaction)) {
        setBestReaction(reactionTime.toFixed(3));
      }

      // Check if interruption was correct
      if (shouldInterrupt) {
        // Correct interruption - they should have interrupted a bad command
        const pointsEarned = Math.max(1, Math.floor((3 - reactionTime) * 10) * level);
        setScore(prevScore => {
          const newScore = prevScore + pointsEarned;
          setHighScore(prevHighScore => Math.max(prevHighScore, newScore));
          return newScore;
        });
        setMessage(`Good catch! This command was dangerous and didn't match the task. Reaction time: ${reactionTime.toFixed(3)}s (+${pointsEarned} points)`);
      } else {
        // Incorrect interruption - they interrupted a good command
        const pointsLost = Math.min(score, level * 5);
        setScore(prevScore => Math.max(0, prevScore - pointsLost));
        setMessage(`Oops! That command was correct for the task. You didn't need to interrupt it. (-${pointsLost} points)`);
      }

      setGamePhase('result');
      stopGame();
    }
  }, [gameActive, gamePhase, level, bestReaction, shouldInterrupt, score]);

  // Start displaying the task
  const beginChallenge = () => {
    // Select random task and command
    const randomTaskPair = taskCommandPairs[Math.floor(Math.random() * taskCommandPairs.length)];
    setCurrentTask(randomTaskPair.task);

    // Decide whether to show good or bad command (50/50 chance)
    const isGoodCommand = Math.random() < 0.5;
    setShouldInterrupt(!isGoodCommand); // Only interrupt if it's a bad command

    // Select a command from the appropriate pool
    const commandPool = isGoodCommand ? randomTaskPair.goodCommands : randomTaskPair.badCommands;
    const randomCommand = commandPool[Math.floor(Math.random() * commandPool.length)];
    setCurrentCommand(randomCommand);

    setGamePhase('pretext');
    setMessage("");
    setGameOver(false);
  };

  // Start the command execution phase
  const startGame = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Initialize command execution phase
    let initialTime;
    if (level === 1) {
      initialTime = 2.5;
    } else if (level === 2) {
      initialTime = 1.6;
    } else {
      initialTime = 0.9;
    }

    initialTimeRef.current = initialTime;
    gameStartTimeRef.current = Date.now();
    setTimeLeft(initialTime);

    // Important: Set these in a specific order to avoid render issues
    setGamePhase('command');
    setGameActive(true);
    startTimeRef.current = Date.now();

    // Create countdown timer
    timerRef.current = setInterval(() => {
      const elapsed = gameStartTimeRef.current ? (Date.now() - gameStartTimeRef.current) / 1000 : 0;
      const remaining = Math.max(0, initialTimeRef.current !== null ? initialTimeRef.current - elapsed : 0);
      setTimeLeft(remaining);

      // Check if time is up
      if (remaining <= 0) {
        if (shouldInterrupt) {
          // Bad command wasn't interrupted - this is incorrect
          const randomError = errorMessages[Math.floor(Math.random() * errorMessages.length)];
          setMessage(randomError);
          setGameOver(true);
        } else {
          // Good command wasn't interrupted - this is correct
          const pointsEarned = level * 5;
          setScore(prevScore => {
            const newScore = prevScore + pointsEarned;
            setHighScore(prevHighScore => Math.max(prevHighScore, newScore));
            return newScore;
          });
          setMessage(`Command executed successfully! That was the right command for the task. (+${pointsEarned} points)`);
        }
        setGamePhase('result');
        stopGame();
      }
    }, 100);
  };

  // Stop the current round
  const stopGame = () => {
    setGameActive(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Reset the game for a new challenge
  const resetGame = () => {
    beginChallenge();
  };

  // Set up event listener for Ctrl+C
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Initialize first challenge on mount only
  useEffect(() => {
    beginChallenge();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4">
      <h1 className="text-4xl font-bold mb-8 text-red-500">Ctrl+C Reflex Trainer</h1>
      <p className="mb-6 text-xl">Train your reflexes for using <span className="font-mono text-green-400">axiom</span></p>

      {/* Terminal window */}
      <div className="w-full max-w-2xl rounded-lg overflow-hidden shadow-lg mb-6">
        <div className="bg-gray-800 px-4 py-2 flex items-center">
          <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
          <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
          <div className="ml-2 font-mono text-sm">terminal</div>
        </div>
        <div className="bg-black p-4 font-mono h-64 flex flex-col">
          <div className="flex-grow">
            {/* Pretext Phase */}
            {gamePhase === 'pretext' && (
              <>
                <p className="text-green-400">axiom@localhost:~$ I need to: <span className="text-yellow-400">{currentTask}</span></p>
                <p className="mt-4">axiom is planning to execute a command...</p>
                <p className="mt-2 text-white">Press <span className="bg-green-700 px-2 py-1 rounded">Start Challenge</span> to see the command</p>
                <p className="mt-4 text-purple-400">
                  <span className="font-bold">Instructions:</span> Press Ctrl+C <span className="text-yellow-300">ONLY IF</span> the command seems dangerous or incorrect for the task!
                </p>
              </>
            )}

            {/* Command Execution Phase */}
            {gamePhase === 'command' && gameActive && (
              <>
                <p className="text-green-400">axiom@localhost:~$ <span className="text-gray-400">// Task: {currentTask}</span></p>
                <p className="text-green-400">axiom@localhost:~$ {currentCommand}</p>
                <p className="mt-2">
                  <span className="text-yellow-400">Command executing in </span>
                  <span className="text-red-500 font-bold text-3xl">{timeLeft.toFixed(1)}</span>
                  <span className="text-yellow-400">s...</span>
                </p>
                <p className="mt-2 text-white">Press <span className="bg-gray-700 px-2 py-1 rounded">Ctrl+C</span> to interrupt!</p>
              </>
            )}

            {/* Game Over State */}
            {gamePhase === 'result' && gameOver && (
              <div className="text-red-500 animate-pulse font-bold">
                <p>═════════════════════════════════════</p>
                <p>{message}</p>
                <p>═════════════════════════════════════</p>
                <p className="mt-4 text-white">System compromised! Too slow...</p>
              </div>
            )}

            {/* Result Phase - Success */}
            {gamePhase === 'result' && !gameOver && (
              <div>
                <p className="text-green-400">axiom@localhost:~$ <span className="text-gray-400">// Task: {currentTask}</span></p>
                <p className="text-green-400">axiom@localhost:~$ {currentCommand}</p>
                <p className="mt-2 text-cyan-400">{message}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Game controls */}
      <div className="flex flex-wrap justify-center gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-2">Difficulty</h2>
          <div className="flex gap-2">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                className={`px-3 py-1 rounded ${level === lvl ? 'bg-blue-600' : 'bg-gray-700'}`}
                onClick={() => setLevel(lvl)}
                disabled={gameActive}
              >
                {lvl === 1 ? 'Easy' : lvl === 2 ? 'Medium' : 'Dangerous'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-2">Score</h2>
          <p className="text-2xl font-mono">{score}</p>
          <p className="text-sm text-gray-400">High: {highScore}</p>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-2">Reaction</h2>
          <p className="text-2xl font-mono">{reaction || '--'} s</p>
          <p className="text-sm text-gray-400">Best: {bestReaction || '--'} s</p>
        </div>
      </div>

      {/* Action button based on game phase */}
      {gamePhase === 'pretext' && (
        <button
          className="px-6 py-3 rounded-lg font-semibold text-lg bg-green-600 hover:bg-green-700"
          onClick={startGame}
        >
          Start Challenge
        </button>
      )}

      {gamePhase === 'command' && (
        <button
          className="px-6 py-3 rounded-lg font-semibold text-lg bg-red-600 hover:bg-red-700"
          onClick={stopGame}
        >
          Stop Game
        </button>
      )}

      {gamePhase === 'result' && (
        <button
          className="px-6 py-3 rounded-lg font-semibold text-lg bg-blue-600 hover:bg-blue-700"
          onClick={resetGame}
        >
          Next Challenge
        </button>
      )}

      <div className="mt-6 text-center max-w-lg">
        <p className="text-sm text-gray-400">
          Don't interrupt commands that correctly fulfill the task! Only use Ctrl+C when axiom tries to run a dangerous command.
        </p>
      </div>
    </div>
  );
};

export default CtrlCTrainer;