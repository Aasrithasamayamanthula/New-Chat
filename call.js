class CallHandler {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCall = null;
        this.currentUser = null;
        this.db = firebase.firestore();

        // Initialize after Firebase Auth
        firebase.auth().onAuthStateChanged(user => {
            this.currentUser = user;
            if (user) {
                this.setupCallListener();
            }
        });

        // DOM Elements
        this.initializeDOMElements();
        this.attachEventListeners();

        // ICE servers configuration
        this.servers = {
            iceServers: [
                {
                    urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
                }
            ]
        };
    }

    initializeDOMElements() {
        // Call interface elements
        this.callModal = document.getElementById('call-modal');
        this.incomingModal = document.getElementById('incoming-call-modal');
        this.localVideo = document.getElementById('local-video');
        this.remoteVideo = document.getElementById('remote-video');
        this.callName = document.getElementById('call-name');
        this.callStatus = document.getElementById('call-status');
        this.callAvatar = document.getElementById('call-avatar');

        // Call controls
        this.voiceCallBtn = document.getElementById('voice-call');
        this.videoCallBtn = document.getElementById('video-call');
        this.toggleMicBtn = document.getElementById('toggle-mic');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.endCallBtn = document.getElementById('end-call');
        this.acceptCallBtn = document.getElementById('accept-call');
        this.rejectCallBtn = document.getElementById('reject-call');

        // Verify all elements are found
        this.verifyElements();
    }

    verifyElements() {
        const elements = {
            'Call Modal': this.callModal,
            'Incoming Modal': this.incomingModal,
            'Local Video': this.localVideo,
            'Remote Video': this.remoteVideo,
            'Call Name': this.callName,
            'Call Status': this.callStatus,
            'Call Avatar': this.callAvatar,
            'Voice Call Button': this.voiceCallBtn,
            'Video Call Button': this.videoCallBtn,
            'Toggle Mic Button': this.toggleMicBtn,
            'Toggle Video Button': this.toggleVideoBtn,
            'End Call Button': this.endCallBtn,
            'Accept Call Button': this.acceptCallBtn,
            'Reject Call Button': this.rejectCallBtn
        };

        for (const [name, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`${name} not found`);
            }
        }
    }

    attachEventListeners() {
        this.voiceCallBtn.addEventListener('click', () => this.startCall('voice'));
        this.videoCallBtn.addEventListener('click', () => this.startCall('video'));
        this.toggleMicBtn.addEventListener('click', () => this.toggleMic());
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.endCallBtn.addEventListener('click', () => this.endCall());
        this.acceptCallBtn.addEventListener('click', () => this.acceptCall());
        this.rejectCallBtn.addEventListener('click', () => this.rejectCall());
    }

    async startCall(type) {
        if (!currentChat) return;

        try {
            this.currentCall = {
                type,
                caller: currentUser.uid,
                receiver: currentChat,
                status: 'calling'
            };

            // Get user media
            const constraints = {
                audio: true,
                video: type === 'video'
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localVideo.srcObject = this.localStream;

            // Create and store call document
            const callRef = await db.collection('calls').add({
                caller: currentUser.uid,
                receiver: currentChat,
                type: type,
                status: 'calling',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.currentCall.id = callRef.id;
            this.showCallModal();

            // Setup WebRTC
            await this.setupPeerConnection();

        } catch (error) {
            console.error('Error starting call:', error);
            alert('Could not start call. Please check your camera/microphone permissions.');
            this.endCall();
        }
    }

    async setupPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.servers);

        // Add local tracks to connection
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Handle incoming tracks
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.remoteVideo.srcObject = this.remoteStream;
        };

        // Create and send offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // Store the offer in Firestore
        await db.collection('calls').doc(this.currentCall.id).update({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });
    }

    async acceptCall() {
        try {
            const constraints = {
                audio: true,
                video: this.currentCall.type === 'video'
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localVideo.srcObject = this.localStream;

            this.incomingModal.classList.add('hidden');
            this.showCallModal();

            // Setup WebRTC
            this.peerConnection = new RTCPeerConnection(this.servers);

            // Add local tracks
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle incoming tracks
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                this.remoteVideo.srcObject = this.remoteStream;
            };

            // Get the offer
            const callDoc = await db.collection('calls').doc(this.currentCall.id).get();
            const offer = callDoc.data().offer;

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Store the answer
            await db.collection('calls').doc(this.currentCall.id).update({
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                status: 'answered'
            });

        } catch (error) {
            console.error('Error accepting call:', error);
            alert('Could not accept call. Please check your camera/microphone permissions.');
            this.endCall();
        }
    }

    rejectCall() {
        db.collection('calls').doc(this.currentCall.id).update({
            status: 'rejected'
        });
        this.incomingModal.classList.add('hidden');
        this.currentCall = null;
    }

    async endCall() {
        if (this.currentCall) {
            await db.collection('calls').doc(this.currentCall.id).update({
                status: 'ended'
            });
        }

        this.cleanup();
    }

    cleanup() {
        // Stop all tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        // Reset variables
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCall = null;

        // Hide modals
        this.callModal.classList.add('hidden');
        this.incomingModal.classList.add('hidden');

        // Reset video elements
        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;
    }

    toggleMic() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            this.toggleMicBtn.innerHTML = audioTrack.enabled ? 
                '<i class="fas fa-microphone"></i>' : 
                '<i class="fas fa-microphone-slash"></i>';
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            this.toggleVideoBtn.innerHTML = videoTrack.enabled ? 
                '<i class="fas fa-video"></i>' : 
                '<i class="fas fa-video-slash"></i>';
        }
    }

    showCallModal() {
        this.callModal.classList.remove('hidden');
        document.getElementById('call-user-name').textContent = 
            document.getElementById('chat-user-name').textContent;
        document.getElementById('call-user-avatar').src = 
            document.getElementById('chat-user-avatar').src;
    }

    setupCallListener() {
        if (!this.currentUser) return; // Add safety check

        try {
            const callsRef = this.db.collection('calls')
                .where('receiverId', '==', this.currentUser.uid);

            callsRef.onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const callData = change.doc.data();
                        this.handleIncomingCall(callData);
                    }
                });
            });
        } catch (error) {
            console.error('Error setting up call listener:', error);
        }

        // Listen for call status changes
        db.collection('calls')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    const call = change.doc.data();
                    if (this.currentCall && change.doc.id === this.currentCall.id) {
                        if (call.status === 'ended' || call.status === 'rejected') {
                            this.cleanup();
                        } else if (call.status === 'answered' && call.answer && this.peerConnection) {
                            this.handleCallAnswer(call.answer);
                        }
                    }
                });
            });
    }

    async handleIncomingCall(callData) {
        if (!this.currentUser) return; // Add safety check

        this.currentCall = {
            id: callData.id,
            ...callData
        };

        // Show incoming call modal
        const caller = await db.collection('users').doc(callData.caller).get();
        const callerData = caller.data();
        
        document.getElementById('incoming-call-name').textContent = callerData.displayName || callerData.email;
        document.getElementById('incoming-call-avatar').src = callerData.photoURL || '/api/placeholder/80/80';
        document.getElementById('incoming-call-type').textContent = 
            `Incoming ${callData.type} call...`;
        
        this.incomingModal.classList.remove('hidden');

        // Play ringtone
        // You can add a ringtone audio here
    }

    async handleCallAnswer(answer) {
        try {
            const remoteDesc = new RTCSessionDescription(answer);
            await this.peerConnection.setRemoteDescription(remoteDesc);
        } catch (error) {
            console.error('Error handling call answer:', error);
        }
    }
}

// Initialize call handler only after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be initialized
    if (typeof firebase !== 'undefined') {
        window.callHandler = new CallHandler();
    } else {
        console.error('Firebase is not initialized');
    }
});
