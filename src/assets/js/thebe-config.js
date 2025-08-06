/**
 * Thebe Configuration for Memo
 * Follows Thebe best practices from documentation
 */

(function () {
  "use strict";

  // Cache DOM queries
  const DOM = {
    getStatusWidget: () => document.querySelector(".thebe-status"),
    getControlsContainer: () => document.querySelector(".thebe-controls"),
    getActionsContainer: () => document.querySelector(".thebe-actions"),
    getRunButtons: () => document.querySelectorAll(".thebe-button.thebe-run-button"),
    getCells: () => document.querySelectorAll(".thebe-cell"),
    getSourceCells: () => document.querySelectorAll("div.sourceCode pre")
  };

  // ---------- UTILITY FUNCTIONS ----------
  const utils = {
    loadCSS(href) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      return Promise.resolve();
    },

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkElement = () => {
          const element = document.querySelector(selector);
          if (element) {
            resolve(element);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error(`Element ${selector} not found after ${timeout}ms`));
          } else {
            requestAnimationFrame(checkElement);
          }
        };
        checkElement();
      });
    }
  };


  // ---------- BOOTSTRAP & INITIALIZATION ----------
  async function waitForCodeMirror(maxAttempts = 100, interval = 200) {
    console.log('⏳ Waiting for CodeMirror to be available...');
    
    for (let i = 0; i < maxAttempts; i++) {
      // Check multiple ways CodeMirror might be available
      if (window.CodeMirror) {
        console.log('✅ CodeMirror is now available (global)');
        return true;
      }
      
      // Check if Thebe has CodeMirror
      if (window.thebe && window.thebe.CodeMirror) {
        console.log('✅ CodeMirror found via thebe.CodeMirror');
        window.CodeMirror = window.thebe.CodeMirror;
        return true;
      }
      
      // Check if any CodeMirror instances exist in DOM
      const cmElements = document.querySelectorAll('.CodeMirror');
      if (cmElements.length > 0) {
        for (const element of cmElements) {
          if (element.CodeMirror && element.CodeMirror.constructor) {
            console.log('✅ CodeMirror found via DOM element');
            // Get the CodeMirror constructor from the instance
            const CM = element.CodeMirror.constructor;
            // Check if it has the prototype we need
            if (CM.prototype && !window.CodeMirror) {
              window.CodeMirror = CM;
              // Also need to copy over any static methods/properties
              if (element.CodeMirror.commands) {
                window.CodeMirror.commands = element.CodeMirror.commands;
              }
            }
            return true;
          }
        }
      }
      
      if (i % 10 === 0 && i > 0) {
        console.log(`⏳ Still waiting for CodeMirror... (attempt ${i}/${maxAttempts})`);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    console.warn('⚠️ Timeout waiting for CodeMirror after ' + (maxAttempts * interval / 1000) + ' seconds');
    return false;
  }
  
  async function loadCodeMirrorCommentAddon() {
    // Wait for CodeMirror to be available
    const cmAvailable = await waitForCodeMirror();
    if (!cmAvailable) {
      console.error('❌ Cannot load comment addon - CodeMirror not available');
      return false;
    }
    
    // Check if addon is already loaded
    if (window.CodeMirror && window.CodeMirror.commands && window.CodeMirror.commands.toggleComment) {
      console.log('✅ CodeMirror comment addon already loaded');
      return true;
    }
    
    // Check if we need to initialize commands object
    if (window.CodeMirror && !window.CodeMirror.commands) {
      console.log('📦 Initializing CodeMirror.commands object');
      window.CodeMirror.commands = {};
    }
    
    console.log('📦 Loading CodeMirror comment addon from CDN...');
    
    // Try to load the addon script
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/comment/comment.min.js';
      
      script.onload = () => {
        console.log('✅ CodeMirror comment addon script loaded from CDN');
        
        // Verify addon is available
        if (window.CodeMirror && window.CodeMirror.commands && window.CodeMirror.commands.toggleComment) {
          console.log('✅ CodeMirror comment addon ready and verified');
          resolve(true);
        } else {
          console.warn('⚠️ Comment addon script loaded but toggleComment not available');
          // Try manual implementation as fallback
          implementManualCommentToggle();
          resolve(true);
        }
      };
      
      script.onerror = (error) => {
        console.error('❌ Failed to load CodeMirror comment addon from CDN:', error);
        // Try manual implementation as fallback
        implementManualCommentToggle();
        resolve(true); // Still resolve true since we have a fallback
      };
      
      document.head.appendChild(script);
    });
  }
  
  // Manual implementation of comment toggle as fallback
  function implementManualCommentToggle() {
    console.log('🔧 Implementing manual comment toggle as fallback...');
    
    if (!window.CodeMirror) {
      console.error('❌ Cannot implement manual toggle - CodeMirror not available');
      return;
    }
    
    if (!window.CodeMirror.commands) {
      window.CodeMirror.commands = {};
    }
    
    window.CodeMirror.commands.toggleComment = function(cm) {
      const selections = cm.listSelections();
      const mode = cm.getMode();
      const commentString = mode.lineComment || (mode.name === 'python' ? '#' : '//');
      
      cm.operation(() => {
        for (const sel of selections) {
          const from = sel.from();
          const to = sel.to();
          
          // Get all lines in selection
          const startLine = from.line;
          const endLine = to.line;
          
          // Check if all non-empty lines are commented
          let allCommented = true;
          for (let i = startLine; i <= endLine; i++) {
            const line = cm.getLine(i);
            if (line.trim() && !line.trim().startsWith(commentString)) {
              allCommented = false;
              break;
            }
          }
          
          // Toggle comments
          for (let i = startLine; i <= endLine; i++) {
            const line = cm.getLine(i);
            if (allCommented) {
              // Remove comment
              const regex = new RegExp('^(\\s*)' + commentString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s?');
              const newLine = line.replace(regex, '$1');
              cm.replaceRange(newLine, {line: i, ch: 0}, {line: i, ch: line.length});
            } else if (line.trim()) {
              // Add comment
              const leadingWhitespace = line.match(/^\s*/)[0];
              const newLine = leadingWhitespace + commentString + ' ' + line.trim();
              cm.replaceRange(newLine, {line: i, ch: 0}, {line: i, ch: line.length});
            }
          }
        }
      });
    };
    
    console.log('✅ Manual comment toggle implemented');
  }
  
  async function bootstrapThebe() {
    try {
      // Load CodeMirror theme CSS
      await utils.loadCSS("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/theme/neo.min.css");
      
      // Set up observer to manage UI elements
      setupMutationObserver();
      
      // Get Thebe configuration from the script tag
      const configScript = document.querySelector('script[type="text/x-thebe-config"]');
      const thebeConfig = configScript ? JSON.parse(configScript.textContent) : {};
      
      console.log('🚀 Starting Thebe bootstrap with config:', thebeConfig);
      
      // Bootstrap Thebe using the configuration
      const thebe = await window.thebe.bootstrap(thebeConfig);
      
      console.log('✅ Thebe bootstrap completed:', thebe);
      
      // Store the thebe instance globally
      window.thebeInstance = thebe;
      
      // Start the comment addon loading process
      // Try immediately and also set up retry mechanism
      setTimeout(async () => {
        console.log('🔄 Attempting to load CodeMirror comment addon...');
        const success = await loadCodeMirrorCommentAddon();
        if (success) {
          console.log('🎯 Setting up comment toggle for CodeMirror instances...');
          setupCodeMirrorCommentToggle();
        } else {
          console.log('⏳ Will retry comment addon loading when CodeMirror becomes available...');
        }
      }, 1000); // Small delay to let Thebe initialize
      
      // Also set up a watcher for CodeMirror instances
      let addonLoaded = false;
      const checkForCodeMirror = setInterval(async () => {
        if (!addonLoaded) {
          const cmElements = document.querySelectorAll('.CodeMirror');
          if (cmElements.length > 0 && !window.CodeMirror) {
            console.log('🔍 CodeMirror instances detected, attempting to set up comment toggle...');
            const success = await loadCodeMirrorCommentAddon();
            if (success) {
              addonLoaded = true;
              setupCodeMirrorCommentToggle();
              clearInterval(checkForCodeMirror);
            }
          } else if (window.CodeMirror && !addonLoaded) {
            console.log('🔍 CodeMirror global detected, loading addon...');
            const success = await loadCodeMirrorCommentAddon();
            if (success) {
              addonLoaded = true;
              setupCodeMirrorCommentToggle();
              clearInterval(checkForCodeMirror);
            }
          }
        }
      }, 2000);
      
      // Clear the interval after 60 seconds to prevent memory leak
      setTimeout(() => clearInterval(checkForCodeMirror), 60000);
      
      // Mount status widget if configured
      if (thebeConfig.mountStatusWidget) {
        console.log('🎛️ Mounting status widget...');
        window.thebe.mountStatusWidget();
      }

      // Set up event listeners for Thebe events
      setupThebeEventListeners(thebe);
      
      // Set up button functionality
      setupThebeButtons();
      
      // Start API-based monitoring instead of DOM parsing
      monitorThebeStatus();
      
      return thebe;
    } catch (err) {
      console.error("Thebe bootstrap failed:", err);
      
      // Check if it's a CORS error
      if (err.message?.includes('CORS') || err.message?.includes('cors') || 
          err.toString().includes('CORS') || err.toString().includes('Access-Control')) {
        console.error('❌ CORS Error: Cannot connect to Binder from localhost');
        console.log('💡 Solutions:');
        console.log('  1. Use JupyterLite (set useJupyterLite: true)');
        console.log('  2. Deploy to a server instead of localhost');
        console.log('  3. Use a CORS proxy');
        updateStatusWidget('cors-error');
      } else {
        updateStatusWidget('failed');
      }
      
      throw err;
    }
  }

  function setupMutationObserver() {
    const observer = new MutationObserver(utils.debounce((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is a run button being added
            if (node.classList?.contains('thebe-run-button')) {
              console.log('🔍 Run button detected - checking if we should show it');
              
              // If we can see busy/idle kernel activity, the kernel is ready
              const hasKernelActivity = window.thebeInstance?.session?.kernel;
              if (hasKernelActivity) {
                console.log('✅ Kernel detected - showing run button');
                node.style.display = '';
                node.style.visibility = 'visible';
                node.style.opacity = '1';
                
                // Also update our state
                thebeState.isKernelReady = true;
                updateConnectionState();
              } else {
                console.log('❌ No kernel - hiding run button');
                node.style.display = 'none';
              }
            }
            
            // Check for run buttons within added nodes
            const runButtons = node.querySelectorAll?.('.thebe-button.thebe-run-button');
            runButtons?.forEach(btn => {
              console.log('🔍 Run button found in added node');
              const hasKernelActivity = window.thebeInstance?.session?.kernel;
              if (hasKernelActivity) {
                console.log('✅ Kernel active - showing run button');
                btn.style.display = '';
                btn.style.visibility = 'visible';
                btn.style.opacity = '1';
                thebeState.isKernelReady = true;
                updateConnectionState();
              } else {
                btn.style.display = 'none';
              }
            });
          }
        });
      });
    }, 100));
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    return observer;
  }

  // Track Thebe state using official API
  let thebeState = {
    server: null,
    session: null, 
    kernel: null,
    isServerReady: false,
    isSessionReady: false,
    isKernelReady: false,
    startupPhase: true
  };

  function setupThebeEventListeners(thebe) {
    console.log('Setting up official Thebe event listeners');
    
    // Store reference to thebe instance
    window.thebeInstance = thebe;
    
    // Listen for structured Thebe status events
    if (thebe.events) {
      thebe.events.on('status', (event, data) => {
        handleThebeStatusEvent(data);
      });
      
      thebe.events.on('error', (event, data) => {
        handleThebeErrorEvent(data);
      });
    }
    
    // Store references to server and session when available
    if (thebe.server) {
      thebeState.server = thebe.server;
      
      // Wait for server to be ready
      thebe.server.ready.then(() => {
        console.log('✅ Thebe server is ready');
        thebeState.isServerReady = true;
        updateConnectionState();
      }).catch(err => {
        console.error('❌ Thebe server failed:', err);
      });
    }
    
    // Monitor for session creation using the correct API
    const checkForSession = async () => {
      try {
        // Check if we already have a session from the thebe instance
        if (thebe.session && !thebeState.session) {
          console.log('📡 Session found in thebe instance');
          thebeState.session = thebe.session;
          thebeState.isSessionReady = true;
          setupKernelMonitoring(thebe.session);
          updateConnectionState();
          return;
        }
        
        // Try to get session from sessionManager if available
        if (thebe.server?.sessionManager) {
          try {
            // Different Thebe versions may have different APIs
            let sessions = [];
            if (typeof thebe.server.sessionManager.running === 'function') {
              const result = thebe.server.sessionManager.running();
              // Handle both async and sync returns
              sessions = result.then ? await result : result;
            }
            
            if (sessions && sessions.length > 0 && !thebeState.session) {
              console.log('📡 Session detected via sessionManager');
              setupSessionMonitoring(thebe);
            }
          } catch (err) {
            console.log('Note: sessionManager.running() not available or failed:', err.message);
          }
        }
        
        // Keep checking until we find a session
        if (!thebeState.session) {
          setTimeout(checkForSession, 1000);
        }
      } catch (err) {
        console.log('Session check error (continuing):', err.message);
        setTimeout(checkForSession, 2000);
      }
    };
    
    checkForSession();
  }
  
  function handleThebeStatusEvent(data) {
    console.log(`Thebe event - Subject: ${data.subject}, Status: ${data.status}, Message: ${data.message}`);
    
    // Handle server status events
    if (data.subject === 'server') {
      if (data.status === 'server-ready') {
        thebeState.isServerReady = true;
        console.log('🚀 Server ready via event');
      } else if (data.status === 'closed') {
        thebeState.isServerReady = false;
        console.log('🔌 Server closed');
      }
    }
    
    // Handle session status events  
    if (data.subject === 'session') {
      if (data.status === 'ready') {
        thebeState.isSessionReady = true;
        console.log('🎯 Session ready via event');
        
        // Try to access the session object
        if (data.object) {
          thebeState.session = data.object;
          setupKernelMonitoring(data.object);
        }
      } else if (data.status === 'shutdown') {
        thebeState.isSessionReady = false;
        thebeState.isKernelReady = false;
        console.log('🛑 Session shutdown');
      }
    }
    
    // Handle kernel status events
    if (data.subject === 'kernel') {
      if (data.status === 'ready') {
        thebeState.isKernelReady = true;
        console.log('⚡ Kernel ready via event');
        
        if (data.object) {
          thebeState.kernel = data.object;
        }
      } else if (data.status === 'shutdown' || data.status === 'dead') {
        thebeState.isKernelReady = false;
        console.log('💀 Kernel shutdown/dead');
      }
    }
    
    updateConnectionState();
  }
  
  function handleThebeErrorEvent(data) {
    console.error(`Thebe error - Subject: ${data.subject}, Status: ${data.status}, Message: ${data.message}`);
    
    if (data.subject === 'server') {
      thebeState.isServerReady = false;
    } else if (data.subject === 'session') {
      thebeState.isSessionReady = false;
    } else if (data.subject === 'kernel') {
      thebeState.isKernelReady = false;
    }
    
    updateConnectionState();
  }
  
  function setupSessionMonitoring(thebe) {
    // First check if we already have a session from thebe instance
    if (thebe.session) {
      thebeState.session = thebe.session;
      thebeState.isSessionReady = true;
      console.log('🔗 Using session from thebe instance');
      
      if (thebe.session.kernel) {
        setupKernelMonitoring(thebe.session);
      }
      updateConnectionState();
      return;
    }
    
    // Try multiple ways to get the session
    if (thebe.server?.sessionManager) {
      try {
        const runningCall = thebe.server.sessionManager.running;
        if (typeof runningCall === 'function') {
          const result = runningCall();
          
          // Handle both promise and direct return
          const handleSessions = (sessions) => {
            if (sessions && sessions.length > 0) {
              // Get the first session
              const sessionModel = sessions[0];
              console.log(`📋 Found session: ${sessionModel.id}`);
              
              // Try to get the actual session object
              if (thebe.server.sessionManager.connectTo) {
                const connectResult = thebe.server.sessionManager.connectTo(sessionModel);
                
                const handleSession = (session) => {
                  thebeState.session = session;
                  thebeState.isSessionReady = true;
                  console.log('🔗 Connected to existing session');
                  
                  if (session.kernel) {
                    setupKernelMonitoring(session);
                  }
                  
                  updateConnectionState();
                };
                
                if (connectResult?.then) {
                  connectResult.then(handleSession);
                } else {
                  handleSession(connectResult);
                }
              }
            }
          };
          
          if (result?.then) {
            result.then(handleSessions);
          } else {
            handleSessions(result);
          }
        }
      } catch (err) {
        console.log('Session monitoring setup failed (continuing):', err.message);
      }
    }
  }
  
  function setupKernelMonitoring(session) {
    if (session.kernel) {
      thebeState.kernel = session.kernel;
      
      // Check current kernel status
      const kernelStatus = session.kernel.status;
      thebeState.isKernelReady = (kernelStatus === 'idle' || kernelStatus === 'ready');
      
      console.log(`🔍 Kernel status: ${kernelStatus}, ready: ${thebeState.isKernelReady}`);
      
      // If kernel is already idle, it's ready
      if (kernelStatus === 'idle') {
        console.log('⚡ Kernel is idle - marking as ready');
        thebeState.isKernelReady = true;
        updateConnectionState();
      }
      
      // Listen for kernel status changes
      session.kernel.statusChanged.connect((kernel, status) => {
        console.log(`🔄 Kernel status changed: ${status}`);
        
        // Mark as ready when we see idle status (which means kernel is connected and working)
        if (status === 'idle') {
          thebeState.isKernelReady = true;
          console.log('✅ Kernel idle - marking as ready');
        } else if (status === 'dead' || status === 'disconnected') {
          console.error(`💀 Kernel ${status}`);
          thebeState.isKernelReady = false;
        }
        
        updateConnectionState();
      });
    }
  }
  
  function updateConnectionState() {
    const wasReady = thebeState.isKernelReady;
    const isReady = checkKernelReady();
    
    console.log(`🔍 Connection state check: Server=${thebeState.isServerReady}, Session=${thebeState.isSessionReady}, Kernel=${thebeState.isKernelReady}, Overall=${isReady}`);
    
    if (isReady && !wasReady) {
      console.log('🎉 Kernel is ready - updating UI!');
      onKernelReady();
    } else if (!isReady && wasReady) {
      console.log('⚠️ Kernel no longer ready');
      onKernelNotReady();
    }
  }
  
  function checkKernelReady() {
    // Use official API to check readiness
    const serverReady = thebeState.server?.isReady || thebeState.isServerReady;
    const sessionReady = thebeState.session?.kernel != null || thebeState.isSessionReady;
    const kernelReady = thebeState.isKernelReady;
    
    return serverReady && sessionReady && kernelReady;
  }
  
  function onKernelReady() {
    const controlsContainer = DOM.getControlsContainer();
    const statusWidget = DOM.getStatusWidget();
    
    updateUIForStatus('ready', controlsContainer, statusWidget);
    runInitializationCells();
    
    // End startup phase after 30 seconds
    if (thebeState.startupPhase) {
      setTimeout(() => {
        thebeState.startupPhase = false;
        console.log('✅ Startup phase complete');
      }, 30000);
    }
  }
  
  function onKernelNotReady() {
    const controlsContainer = DOM.getControlsContainer();
    const statusWidget = DOM.getStatusWidget();
    
    updateUIForStatus('loading', controlsContainer, statusWidget);
  }

  function runInitializationCells() {
    // Run any cells marked with 'thebe-init' class
    const initCells = document.querySelectorAll('.thebe-init');
    initCells.forEach((cell) => {
      const runButton = cell.querySelector('.thebe-run-button');
      if (runButton) {
        setTimeout(() => runButton.click(), 100);
      }
    });
  }

  // ---------- STATUS MANAGEMENT ----------
  let statusUpdateTimeout = null;
  
  function isStatusLoading(status) {
    return ['loading', 'server-connecting', 'session-starting', 'kernel-starting', 'cors-error'].includes(status);
  }
  
  function isStatusReady(status) {
    return status === 'ready';
  }
  
  function updateStatusWidget(status) {
    // Debounce status widget updates
    if (statusUpdateTimeout) {
      clearTimeout(statusUpdateTimeout);
    }
    
    statusUpdateTimeout = setTimeout(() => {
      const statusWidget = DOM.getStatusWidget();
      if (statusWidget) {
        // Remove all status classes
        statusWidget.className = statusWidget.className
          .split(' ')
          .filter(c => !c.startsWith('thebe-status-'))
          .join(' ');
        
        // Add new status class
        statusWidget.classList.add(`thebe-status-${status}`);
        
        // Update loading state
        if (isStatusLoading(status)) {
          statusWidget.classList.add('loading');
        } else {
          statusWidget.classList.remove('loading');
        }
        
        // Update ready state
        if (isStatusReady(status)) {
          statusWidget.classList.add('ready');
        } else {
          statusWidget.classList.remove('ready');
        }
      }
    }, 50); // Debounce by 50ms
  }

  // ---------- THEBE ACTION FUNCTIONS ----------
  const thebeActions = {
    clearAllOutputs() {
      // Use Thebe API if available
      if (window.thebeInstance?.clearAllOutputs) {
        window.thebeInstance.clearAllOutputs();
        return;
      }
      
      // Fallback: manually clear outputs
      DOM.getCells().forEach(cell => {
        const outputArea = cell.querySelector('.thebe-output');
        if (outputArea) {
          outputArea.innerHTML = '';
        }
        cell.classList.remove('thebe-error', 'error');
      });
    },

    async runAllCells() {
      // Use Thebe API if available
      if (window.thebeInstance?.renderAllCells) {
        window.thebeInstance.renderAllCells();
        return;
      }
      
      // Fallback: click all run buttons with staggered timing
      const runButtons = DOM.getRunButtons();
      for (let i = 0; i < runButtons.length; i++) {
        runButtons[i].click();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },

    restartKernel() {
      const kernel = getKernelConnection();
      if (kernel) {
        console.log('🔄 Restarting kernel via official API');
        return kernel.restart();
      }
      console.warn('No kernel available to restart');
    },

    async restartAndRunAll() {
      await this.restartKernel();
      // Wait for kernel to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.runAllCells();
    },

    toggleRunButtons(show) {
      // Get all run buttons, including those that might have been hidden
      const runButtons = document.querySelectorAll('.thebe-button.thebe-run-button, .thebe-run-button');
      
      // Track if any buttons were actually changed
      let changedCount = 0;
      
      runButtons.forEach(btn => {
        const currentlyHidden = btn.style.display === 'none' || getComputedStyle(btn).display === 'none';
        
        if (show && currentlyHidden) {
          btn.style.display = '';
          btn.style.visibility = 'visible';
          btn.style.opacity = '1';
          changedCount++;
        } else if (!show && !currentlyHidden) {
          btn.style.display = 'none';
          changedCount++;
        }
      });
      
      // Always log button changes to track UI state
      if (changedCount > 0) {
        console.log(`Buttons: Changed ${changedCount}/${runButtons.length} to ${show ? 'visible' : 'hidden'}`);
      } else if (runButtons.length > 0 && Math.random() < 0.05) { // Log 5% of no-ops
        console.log(`Buttons: No change needed (${runButtons.length} already ${show ? 'visible' : 'hidden'})`);
      }
    },

    executeCode(code) {
      const kernel = getKernelConnection();
      if (kernel) {
        console.log('⚡ Executing code via official API');
        return kernel.requestExecute({ code });
      }
      console.warn('No kernel available to execute code');
    }
  };

  function setupThebeButtons() {
    // Set up button event listeners
    const buttons = {
      'thebe-run-all': thebeActions.runAllCells,
      'thebe-restart': thebeActions.restartKernel,
      'thebe-restart-run-all': thebeActions.restartAndRunAll
    };
    
    Object.entries(buttons).forEach(([id, handler]) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          handler.call(thebeActions);
        });
      }
    });

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + Enter: Run all cells
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        thebeActions.runAllCells();
      }
      
      // Ctrl/Cmd + Shift + 0: Restart kernel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '0') {
        e.preventDefault();
        thebeActions.restartKernel();
      }
    });
  }
  
  function setupCodeMirrorCommentToggle() {
    console.log('🔧 Setting up CodeMirror comment toggle...');
    
    // Configure all existing instances immediately
    configureAllCodeMirrorInstances();
    
    // Also set up observer for future CodeMirror instances
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is or contains a CodeMirror element
            if (node.classList?.contains('CodeMirror')) {
              // Small delay to ensure the instance is fully initialized
              setTimeout(() => configureCodeMirrorInstance(node), 100);
            } else if (node.querySelectorAll) {
              const editors = node.querySelectorAll('.CodeMirror');
              editors.forEach(editor => {
                setTimeout(() => configureCodeMirrorInstance(editor), 100);
              });
            }
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also configure after a delay to catch any editors that were created during initialization
    setTimeout(() => {
      configureAllCodeMirrorInstances();
    }, 2000);
  }
  
  function configureAllCodeMirrorInstances() {
    document.querySelectorAll('.CodeMirror').forEach(configureCodeMirrorInstance);
  }
  
  function configureCodeMirrorInstance(element) {
    if (element.CodeMirror && !element.dataset.commentToggleConfigured) {
      const cm = element.CodeMirror;
      
      try {
        // Get current extraKeys and preserve existing shortcuts
        const currentExtraKeys = cm.getOption('extraKeys') || {};
        
        // Check if comment addon is available
        if (window.CodeMirror && window.CodeMirror.commands && window.CodeMirror.commands.toggleComment) {
          // Use the addon's toggleComment
          cm.setOption('extraKeys', {
            ...currentExtraKeys,
            'Cmd-/': 'toggleComment',
            'Ctrl-/': 'toggleComment'
          });
          console.log('✅ Comment toggle configured using addon');
        } else {
          console.warn('⚠️ Comment addon not available, using direct function binding');
          
          // First ensure we have the manual implementation
          if (!window.CodeMirror) {
            // Try to get CodeMirror from the instance
            window.CodeMirror = cm.constructor;
          }
          
          // Implement manual toggle if needed
          if (!window.CodeMirror.commands || !window.CodeMirror.commands.toggleComment) {
            implementManualCommentToggle();
          }
          
          // Bind the function directly to the keys
          const toggleFn = function(cm) {
            if (window.CodeMirror && window.CodeMirror.commands && window.CodeMirror.commands.toggleComment) {
              window.CodeMirror.commands.toggleComment(cm);
            } else {
              // Inline implementation as last resort
              const sel = cm.getSelection() || cm.getLine(cm.getCursor().line);
              const mode = cm.getMode();
              const commentString = mode.lineComment || (mode.name === 'python' ? '# ' : '// ');
              
              if (sel) {
                // Toggle selection
                const isCommented = sel.startsWith(commentString);
                const newText = isCommented ? 
                  sel.replace(new RegExp('^' + commentString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '') : 
                  commentString + sel;
                cm.replaceSelection(newText);
              } else {
                // Toggle current line
                const cursor = cm.getCursor();
                const line = cm.getLine(cursor.line);
                const isCommented = line.trim().startsWith(commentString.trim());
                const newLine = isCommented ?
                  line.replace(new RegExp('^(\\s*)' + commentString.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s?'), '$1') :
                  line.replace(/^(\s*)/, '$1' + commentString);
                cm.replaceRange(newLine, {line: cursor.line, ch: 0}, {line: cursor.line, ch: line.length});
              }
            }
          };
          
          // Set the function directly
          cm.setOption('extraKeys', {
            ...currentExtraKeys,
            'Cmd-/': toggleFn,
            'Ctrl-/': toggleFn
          });
          console.log('✅ Comment toggle configured using direct function');
        }
        
        element.dataset.commentToggleConfigured = 'true';
        
        // Verify configuration was applied
        const verifyKeys = cm.getOption('extraKeys') || {};
        if (verifyKeys['Cmd-/'] && verifyKeys['Ctrl-/']) {
          console.log('✅ Comment toggle shortcuts verified for instance');
        } else {
          console.error('❌ Failed to configure comment toggle - extraKeys not set properly');
        }
      } catch (error) {
        console.error('❌ Error configuring CodeMirror instance:', error);
      }
    }
  }

  // ---------- STATUS HELPERS (Using Official API) ----------
  function isThebeReady() {
    return checkKernelReady();
  }
  
  function getThebeStatus() {
    if (!thebeState.isServerReady) {
      return 'server-connecting';
    }
    if (!thebeState.isSessionReady) {
      return 'session-starting';
    }
    if (!thebeState.isKernelReady) {
      return 'kernel-starting';
    }
    return 'ready';
  }
  
  function getKernelConnection() {
    return thebeState.kernel || thebeState.session?.kernel || window.thebeInstance?.session?.kernel;
  }
  
  function getThebeSession() {
    return thebeState.session || window.thebeInstance?.session;
  }
  
  function getThebeServer() {
    return thebeState.server || window.thebeInstance?.server;
  }

  // Track last UI status to avoid redundant updates
  let lastUIStatus = null;
  let redundantUpdateCount = 0;

  function updateUIForStatus(status, controlsContainer, statusWidget) {
    if (!controlsContainer || !statusWidget) return;
    
    // Track redundant updates
    if (status === lastUIStatus) {
      redundantUpdateCount++;
      if (redundantUpdateCount % 10 === 0) {
        console.warn(`⚠️ Redundant UI update attempted ${redundantUpdateCount} times for status: ${status}`);
      }
      return;
    }
    
    redundantUpdateCount = 0;
    console.log(`UI status: ${lastUIStatus} → ${status}`);
    lastUIStatus = status;
    
    // Determine status booleans
    const isReady = status === 'ready';
    const isLoading = status === 'loading';
    const isFailed = status === 'failed';
    
    // Update controls container
    controlsContainer.classList.toggle('ready', isReady);
    controlsContainer.classList.toggle('loading', isLoading);
    controlsContainer.classList.toggle('failed', isFailed);
    
    // Update status widget - remove incorrect loading class when ready
    if (isReady) {
      statusWidget.classList.remove('loading', 'thebe-status-loading');
      statusWidget.classList.add('ready');
    } else if (isLoading) {
      statusWidget.classList.add('loading');
      statusWidget.classList.remove('ready');
    } else {
      statusWidget.classList.remove('loading', 'ready');
    }
    
    // Show/hide run buttons based on status
    thebeActions.toggleRunButtons(isReady);
    
    // Add/remove ready class to cell controls for CSS-based visibility
    const cellControls = document.querySelectorAll('.thebe-cell .thebe-controls');
    cellControls.forEach(ctrl => {
      if (isReady) {
        ctrl.classList.add('ready');
      } else {
        ctrl.classList.remove('ready');
      }
    });
    
    // Update actions container visibility
    const actionsContainer = DOM.getActionsContainer();
    if (actionsContainer) {
      actionsContainer.style.display = isReady ? 'flex' : 'none';
    }
  }

  function monitorThebeStatus() {
    // Monitor using official Thebe API instead of DOM parsing
    console.log('Starting Thebe status monitoring via official API');
    
    // Check status periodically using official API
    const statusChecker = setInterval(() => {
      const thebeReady = isThebeReady();
      const currentStatus = getThebeStatus();
      
      // Update UI based on official API status
      const controlsContainer = DOM.getControlsContainer();
      const statusWidget = DOM.getStatusWidget();
      
      if (thebeReady) {
        updateUIForStatus('ready', controlsContainer, statusWidget);
        
        // Stop checking once ready and stable
        setTimeout(() => {
          if (isThebeReady()) {
            console.log('✅ Thebe stable, reducing status checks');
            clearInterval(statusChecker);
          }
        }, 10000); // Wait 10 seconds to ensure stability
      } else {
        const uiStatus = currentStatus.includes('server') ? 'loading' : 
                        currentStatus.includes('session') ? 'loading' : 
                        currentStatus.includes('kernel') ? 'loading' : 'loading';
        updateUIForStatus(uiStatus, controlsContainer, statusWidget);
      }
    }, 1000); // Check every second
  }


  // ---------- TESTING FUNCTIONS ----------
  function testCommentToggleFunctionality() {
    const results = {
      addonLoaded: !!window.CodeMirror?.commands?.toggleComment,
      instances: [],
      summary: { total: 0, configured: 0, working: 0 }
    };
    
    const cmElements = document.querySelectorAll('.CodeMirror');
    results.summary.total = cmElements.length;
    
    cmElements.forEach((el, index) => {
      if (el.CodeMirror) {
        const cm = el.CodeMirror;
        const extraKeys = cm.getOption('extraKeys') || {};
        const hasCommentToggle = extraKeys['Cmd-/'] === 'toggleComment' && 
                                extraKeys['Ctrl-/'] === 'toggleComment';
        
        const instanceData = {
          index,
          configured: hasCommentToggle,
          extraKeys: Object.keys(extraKeys),
          hasCommentCommand: !!cm.commands?.toggleComment
        };
        
        results.instances.push(instanceData);
        
        if (hasCommentToggle) results.summary.configured++;
        if (hasCommentToggle && window.CodeMirror?.commands?.toggleComment) results.summary.working++;
      }
    });
    
    console.group('Comment Toggle Test Results');
    console.log('Addon loaded:', results.addonLoaded);
    console.log('Instances:', `${results.summary.working}/${results.summary.total} working`);
    console.table(results.instances);
    console.groupEnd();
    
    return results;
  }
  
  // Expose for debugging
  window.testCommentToggle = testCommentToggleFunctionality;

  // ---------- PUBLIC API ----------
  window.bootstrapThebe = bootstrapThebe;
  
  window.thebeAPI = {
    // Core functions
    bootstrapThebe,
    
    // Action functions
    ...thebeActions,
    
    // Status helpers (Official API)
    isThebeReady,
    getThebeStatus,
    getKernelConnection,
    getThebeSession,
    getThebeServer,
    checkKernelReady,
    
    // UI functions
    updateUIForStatus,
    
    // Utility functions
    utils,
    
    // DOM helpers
    DOM,
    
    // State access
    getThebeState: () => thebeState
  };

  // ---------- API-BASED STATE CHECKER ----------
  function startThebeStateChecker() {
    console.log('🔍 Starting API-based Thebe state checker');
    
    let checksWithoutChanges = 0;
    
    const intervalId = setInterval(() => {
      // Stop checking if stable for a while
      if (checksWithoutChanges > 15) {
        console.log('✅ Thebe state checker: Stopping (system stable)');
        clearInterval(intervalId);
        return;
      }
      
      // Use official API to check state
      const thebeReady = isThebeReady();
      const controlsContainer = DOM.getControlsContainer();
      const statusWidget = DOM.getStatusWidget();
      
      if (thebeReady && controlsContainer && statusWidget) {
        let changesMade = false;
        
        // Ensure UI reflects ready state
        if (!controlsContainer.classList.contains('ready')) {
          controlsContainer.classList.add('ready');
          controlsContainer.classList.remove('loading');
          changesMade = true;
        }
        
        if (statusWidget.classList.contains('loading')) {
          statusWidget.classList.remove('loading', 'thebe-status-loading');
          statusWidget.classList.add('ready');
          changesMade = true;
        }
        
        // Ensure run buttons are visible
        const runButtons = document.querySelectorAll('.thebe-button.thebe-run-button, .thebe-run-button');
        runButtons.forEach(btn => {
          if (btn.style.display === 'none') {
            btn.style.display = '';
            btn.style.visibility = 'visible';
            btn.style.opacity = '1';
            changesMade = true;
          }
        });
        
        // Ensure navbar actions are visible
        const actionsContainer = DOM.getActionsContainer();
        if (actionsContainer && actionsContainer.style.display === 'none') {
          actionsContainer.style.display = 'flex';
          changesMade = true;
        }
        
        if (changesMade) {
          console.warn('🔧 Fixed UI state based on Thebe API');
          checksWithoutChanges = 0;
        } else {
          checksWithoutChanges++;
        }
      } else {
        checksWithoutChanges++;
      }
    }, 2000);
  }

  // ---------- INITIALIZATION ----------
  function initializeThebe() {
    // Mark code cells as executable
    DOM.getSourceCells().forEach((pre) => {
      pre.setAttribute("data-executable", "true");
      pre.setAttribute("data-language", "python");
    });

    // Set up activate buttons
    document.querySelectorAll("[data-thebe-activate]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        
        // Update UI state
        const controlsContainer = btn.closest('.thebe-controls');
        if (controlsContainer) {
          controlsContainer.classList.add('activated');
        }
        
        // Hide the activate button
        btn.style.display = 'none';
        
        // Bootstrap Thebe
        try {
          await bootstrapThebe();
          // Start the API-based state checker after bootstrap
          startThebeStateChecker();
        } catch (err) {
          console.error('Failed to bootstrap Thebe:', err);
          // Show the button again on failure
          btn.style.display = '';
          if (controlsContainer) {
            controlsContainer.classList.remove('activated');
          }
        }
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeThebe);
  } else {
    // DOM is already loaded
    initializeThebe();
  }
  
  // Export test function globally for debugging
  window.testCommentToggle = function() {
    console.log('\ud83e\uddea Testing CodeMirror comment toggle...');
    console.log('CodeMirror available:', !!window.CodeMirror);
    console.log('Comment addon loaded:', !!(window.CodeMirror?.commands?.toggleComment));
    
    const editors = document.querySelectorAll('.CodeMirror');
    console.log(`Found ${editors.length} CodeMirror instances`);
    
    editors.forEach((el, i) => {
      if (el.CodeMirror) {
        const extraKeys = el.CodeMirror.getOption('extraKeys');
        console.log(`Editor ${i + 1}: Cmd-/ = ${extraKeys?.['Cmd-/']}, Ctrl-/ = ${extraKeys?.['Ctrl-/']}`);
      }
    });
    
    return {
      codeMirror: !!window.CodeMirror,
      addon: !!(window.CodeMirror?.commands?.toggleComment),
      editors: editors.length
    };
  };

  // Enhanced debugging utilities
  window.debugCommentToggle = {
    // Check environment
    checkEnvironment() {
      console.log('🔍 Environment Debug Info:');
      console.log('  CodeMirror:', !!window.CodeMirror);
      console.log('  Thebe:', !!window.thebe);
      console.log('  ThebeInstance:', !!window.thebeInstance);
      console.log('  Comment Addon:', !!(window.CodeMirror?.commands?.toggleComment));
      console.log('  Page URL:', window.location.href);
      console.log('  User Agent:', navigator.userAgent);
      
      const configScript = document.querySelector('script[type="text/x-thebe-config"]');
      if (configScript) {
        try {
          const config = JSON.parse(configScript.textContent);
          console.log('  Thebe Config extraKeys:', config.codeMirrorConfig?.extraKeys);
        } catch (e) {
          console.error('  Failed to parse Thebe config:', e);
        }
      }
      
      return {
        codeMirror: !!window.CodeMirror,
        thebe: !!window.thebe,
        thebeInstance: !!window.thebeInstance,
        commentAddon: !!(window.CodeMirror?.commands?.toggleComment),
        url: window.location.href
      };
    },
    
    // Check all instances
    checkInstances() {
      console.log('🔍 Instance Debug Info:');
      const editors = document.querySelectorAll('.CodeMirror');
      console.log(`  Total instances: ${editors.length}`);
      
      const instanceData = [];
      editors.forEach((element, index) => {
        if (element.CodeMirror) {
          const cm = element.CodeMirror;
          const extraKeys = cm.getOption('extraKeys') || {};
          const configured = element.dataset.commentToggleConfigured === 'true';
          
          const data = {
            index: index + 1,
            configured,
            'Cmd-/': extraKeys['Cmd-/'] || 'not set',
            'Ctrl-/': extraKeys['Ctrl-/'] || 'not set',
            mode: cm.getOption('mode'),
            theme: cm.getOption('theme')
          };
          
          instanceData.push(data);
          console.log(`  Instance ${index + 1}:`);
          console.log(`    Configured: ${configured}`);
          console.log(`    Cmd-/: ${extraKeys['Cmd-/']}`);
          console.log(`    Ctrl-/: ${extraKeys['Ctrl-/']}`);
        }
      });
      
      if (instanceData.length > 0) {
        console.table(instanceData);
      }
      
      return instanceData;
    },
    
    // Force reconfiguration
    forceReconfigure() {
      console.log('🔧 Forcing reconfiguration of all instances...');
      
      // First ensure addon is loaded
      if (!window.CodeMirror?.commands?.toggleComment) {
        console.log('⏳ Loading comment addon first...');
        loadCodeMirrorCommentAddon().then(() => {
          console.log('✅ Addon loaded, configuring instances...');
          configureAllCodeMirrorInstances();
        });
      } else {
        configureAllCodeMirrorInstances();
      }
      
      const result = this.checkInstances();
      return result;
    },
    
    // Test comment functionality
    testComment(instanceIndex = 0) {
      const editors = document.querySelectorAll('.CodeMirror');
      if (instanceIndex >= editors.length) {
        console.error(`❌ Instance ${instanceIndex} not found (only ${editors.length} available)`);
        return false;
      }
      
      const element = editors[instanceIndex];
      if (!element.CodeMirror) {
        console.error(`❌ Instance ${instanceIndex} does not have CodeMirror`);
        return false;
      }
      
      const cm = element.CodeMirror;
      const original = cm.getValue();
      
      console.log(`🧪 Testing comment on instance ${instanceIndex}...`);
      
      try {
        // Test single line
        cm.setValue('print("Hello World")');
        cm.setCursor(0, 0);
        console.log('Before toggle:', cm.getValue());
        
        window.CodeMirror.commands.toggleComment(cm);
        const commented = cm.getValue();
        console.log('After adding comment:', commented);
        
        window.CodeMirror.commands.toggleComment(cm);
        const uncommented = cm.getValue();
        console.log('After removing comment:', uncommented);
        
        // Test multi-line
        cm.setValue('def hello():\n    print("Hello")\n    return True');
        cm.setSelection({line: 0, ch: 0}, {line: 2, ch: 15});
        
        window.CodeMirror.commands.toggleComment(cm);
        const multiCommented = cm.getValue();
        console.log('Multi-line commented:', multiCommented);
        
        // Restore original
        cm.setValue(original);
        
        const success = commented.includes('#') && !uncommented.includes('#');
        console.log(success ? '✅ Comment toggle working!' : '❌ Comment toggle failed');
        return success;
      } catch (error) {
        console.error('❌ Error during test:', error);
        cm.setValue(original);
        return false;
      }
    },
    
    // Monitor for new instances
    monitorNewInstances(duration = 10000) {
      console.log(`👁️ Monitoring for new CodeMirror instances for ${duration/1000} seconds...`);
      
      let instanceCount = document.querySelectorAll('.CodeMirror').length;
      console.log(`Starting with ${instanceCount} instances`);
      
      const interval = setInterval(() => {
        const newCount = document.querySelectorAll('.CodeMirror').length;
        if (newCount > instanceCount) {
          console.log(`🆕 New instances detected! ${instanceCount} → ${newCount}`);
          instanceCount = newCount;
          
          // Configure new instances
          setTimeout(() => {
            configureAllCodeMirrorInstances();
            this.checkInstances();
          }, 100);
        }
      }, 500);
      
      setTimeout(() => {
        clearInterval(interval);
        console.log('👁️ Monitoring stopped');
      }, duration);
      
      return interval;
    }
  };

  // Comprehensive test suite
  class CommentToggleTestSuite {
    constructor() {
      this.results = {
        total: 0,
        passed: 0,
        failed: 0,
        tests: []
      };
    }
    
    async runAllTests() {
      console.log('🧪 Starting Comprehensive Comment Toggle Test Suite...');
      console.log('=' .repeat(50));
      
      await this.testEnvironment();
      await this.testConfiguration();
      await this.testFunctionality();
      await this.testKeyboardShortcuts();
      
      this.printSummary();
      return this.results;
    }
    
    test(name, testFunction) {
      this.results.total++;
      console.log(`🧪 Running: ${name}`);
      
      try {
        const result = testFunction();
        if (result) {
          this.results.passed++;
          this.results.tests.push({ name, status: 'PASS' });
          console.log(`  ✅ PASS`);
        } else {
          this.results.failed++;
          this.results.tests.push({ name, status: 'FAIL' });
          console.log(`  ❌ FAIL`);
        }
      } catch (error) {
        this.results.failed++;
        this.results.tests.push({ name, status: 'ERROR', error: error.message });
        console.log(`  💥 ERROR: ${error.message}`);
      }
    }
    
    async testEnvironment() {
      console.log('\n📋 Environment Tests:');
      
      this.test('CodeMirror is loaded', () => {
        return !!window.CodeMirror;
      });
      
      this.test('Comment addon is loaded', () => {
        return !!(window.CodeMirror?.commands?.toggleComment);
      });
      
      this.test('At least one CodeMirror instance exists', () => {
        return document.querySelectorAll('.CodeMirror').length > 0;
      });
      
      this.test('Thebe configuration exists', () => {
        return !!document.querySelector('script[type="text/x-thebe-config"]');
      });
      
      this.test('Thebe config includes extraKeys', () => {
        const configScript = document.querySelector('script[type="text/x-thebe-config"]');
        if (!configScript) return false;
        
        try {
          const config = JSON.parse(configScript.textContent);
          const extraKeys = config.codeMirrorConfig?.extraKeys;
          return !!(extraKeys && extraKeys['Cmd-/'] && extraKeys['Ctrl-/']);
        } catch (e) {
          return false;
        }
      });
    }
    
    async testConfiguration() {
      console.log('\n⚙️ Configuration Tests:');
      
      this.test('At least one instance has comment shortcuts', () => {
        const editors = document.querySelectorAll('.CodeMirror');
        if (editors.length === 0) return false;
        
        for (const element of editors) {
          if (element.CodeMirror) {
            const extraKeys = element.CodeMirror.getOption('extraKeys') || {};
            if (extraKeys['Cmd-/'] === 'toggleComment' && extraKeys['Ctrl-/'] === 'toggleComment') {
              return true;
            }
          }
        }
        return false;
      });
      
      this.test('All instances marked as configured', () => {
        const editors = document.querySelectorAll('.CodeMirror');
        if (editors.length === 0) return false;
        
        const configuredElements = document.querySelectorAll('.CodeMirror[data-comment-toggle-configured="true"]');
        return configuredElements.length === editors.length;
      });
    }
    
    async testFunctionality() {
      console.log('\n🔧 Functionality Tests:');
      
      this.test('toggleComment function exists', () => {
        return typeof window.CodeMirror?.commands?.toggleComment === 'function';
      });
      
      this.test('Comment toggle works on test content', () => {
        const editor = document.querySelector('.CodeMirror');
        if (!editor?.CodeMirror) return false;
        
        const cm = editor.CodeMirror;
        const original = cm.getValue();
        
        try {
          cm.setValue('test line');
          cm.setCursor(0, 0);
          
          window.CodeMirror.commands.toggleComment(cm);
          const commented = cm.getValue();
          
          window.CodeMirror.commands.toggleComment(cm);
          const uncommented = cm.getValue();
          
          cm.setValue(original);
          
          return commented.includes('#') && !uncommented.includes('#');
        } catch (error) {
          cm.setValue(original);
          return false;
        }
      });
      
      this.test('Multi-line comment toggle works', () => {
        const editor = document.querySelector('.CodeMirror');
        if (!editor?.CodeMirror) return false;
        
        const cm = editor.CodeMirror;
        const original = cm.getValue();
        
        try {
          cm.setValue('line1\nline2\nline3');
          cm.setSelection({line: 0, ch: 0}, {line: 2, ch: 5});
          
          window.CodeMirror.commands.toggleComment(cm);
          const commented = cm.getValue();
          
          const lines = commented.split('\n');
          const allCommented = lines.every(line => line.startsWith('#') || line.trim() === '');
          
          cm.setValue(original);
          return allCommented;
        } catch (error) {
          cm.setValue(original);
          return false;
        }
      });
    }
    
    async testKeyboardShortcuts() {
      console.log('\n⌨️ Keyboard Shortcut Tests:');
      
      this.test('Cmd-/ shortcut is mapped', () => {
        const editor = document.querySelector('.CodeMirror');
        if (!editor?.CodeMirror) return false;
        
        const extraKeys = editor.CodeMirror.getOption('extraKeys') || {};
        return extraKeys['Cmd-/'] === 'toggleComment';
      });
      
      this.test('Ctrl-/ shortcut is mapped', () => {
        const editor = document.querySelector('.CodeMirror');
        if (!editor?.CodeMirror) return false;
        
        const extraKeys = editor.CodeMirror.getOption('extraKeys') || {};
        return extraKeys['Ctrl-/'] === 'toggleComment';
      });
    }
    
    printSummary() {
      console.log('\n' + '=' .repeat(50));
      console.log('📊 Test Results Summary:');
      console.log(`  Total Tests: ${this.results.total}`);
      console.log(`  Passed: ${this.results.passed} ✅`);
      console.log(`  Failed: ${this.results.failed} ❌`);
      console.log(`  Success Rate: ${Math.round((this.results.passed / this.results.total) * 100)}%`);
      
      if (this.results.failed > 0) {
        console.log('\n❌ Failed Tests:');
        this.results.tests.filter(t => t.status !== 'PASS').forEach(test => {
          console.log(`  - ${test.name}${test.error ? ': ' + test.error : ''}`);
        });
      }
      
      console.log('=' .repeat(50));
    }
  }
  
  // Export test suite
  window.runCommentToggleTests = async function() {
    const testSuite = new CommentToggleTestSuite();
    return await testSuite.runAllTests();
  };
  
  // Quick test function
  window.quickCommentTest = function() {
    console.log('🚀 Quick Comment Test');
    console.log('1. Checking environment...');
    window.debugCommentToggle.checkEnvironment();
    
    console.log('\n2. Checking instances...');
    window.debugCommentToggle.checkInstances();
    
    console.log('\n3. Testing functionality...');
    return window.debugCommentToggle.testComment(0);
  };
  
  // Emergency fix function for users
  window.fixCommentToggle = async function() {
    console.log('🔧 Running emergency comment toggle fix...');
    
    // Step 1: Ensure CodeMirror is available globally
    const cmElements = document.querySelectorAll('.CodeMirror');
    if (cmElements.length === 0) {
      console.error('❌ No CodeMirror editors found. Please run a code cell first.');
      return false;
    }
    
    if (cmElements[0].CodeMirror && !window.CodeMirror) {
      window.CodeMirror = cmElements[0].CodeMirror.constructor;
      console.log('✅ Made CodeMirror global');
    }
    
    // Step 2: Load or implement comment toggle
    if (!window.CodeMirror?.commands?.toggleComment) {
      console.log('📦 Implementing comment toggle...');
      implementManualCommentToggle();
    }
    
    // Step 3: Configure all instances
    let configured = 0;
    cmElements.forEach((el) => {
      if (el.CodeMirror) {
        const cm = el.CodeMirror;
        const extraKeys = cm.getOption('extraKeys') || {};
        
        // Create a toggle function
        const toggleFn = function(cm) {
          if (window.CodeMirror?.commands?.toggleComment) {
            window.CodeMirror.commands.toggleComment(cm);
          } else {
            console.error('Toggle function not available');
          }
        };
        
        cm.setOption('extraKeys', {
          ...extraKeys,
          'Cmd-/': toggleFn,
          'Ctrl-/': toggleFn
        });
        
        el.dataset.commentToggleConfigured = 'true';
        configured++;
      }
    });
    
    console.log(`✅ Fixed ${configured} editor(s)`);
    console.log('🎉 Comment toggle should now work! Try cmd-/ or Ctrl-/');
    
    // Test it
    console.log('\n🧪 Testing the fix...');
    return window.debugCommentToggle.testComment(0);
  };
})();
