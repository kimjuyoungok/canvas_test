'use client';

import { useRef, useEffect } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let handLandmarker: HandLandmarker;
    let animationFrameId: number;

    // --- [게임 데이터 설정] ---
    let pimples: { x: number; y: number; size: number; id: number }[] = [];
    let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
    let score = 0;
    let nextId = 0;

    // 여드름 랜덤 생성 함수
    const spawnPimple = () => {
      pimples.push({
        x: 0.2 + Math.random() * 0.6, // 화면 너무 구석은 피함
        y: 0.2 + Math.random() * 0.6,
        size: 35 + Math.random() * 15,
        id: nextId++
      });
    };

    // 처음에 여드름 3개 생성
    for (let i = 0; i < 3; i++) spawnPimple();

    const setupHandDetection = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      // 📱 모바일 전면 카메라 강제 호출
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" } 
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startLoop();
        };
      }
    };

    const startLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const render = () => {
        // 모바일 화면 크기에 맞게 캔버스 설정
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const results = handLandmarker.detectForVideo(video, performance.now());

        ctx.save();
        ctx.fillStyle = "#1a1a1a"; // 배경색
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 거울 모드
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);

        // 1. 카메라 영상 그리기 (투명도 조절)
        ctx.globalAlpha = 0.4;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;

        // 2. 현재 여드름들 그리기
        pimples.forEach(p => {
          const px = p.x * canvas.width;
          const py = p.y * canvas.height;
          
          // 부어오른 부위
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 90, 90, 0.7)";
          ctx.fill();
          
          // 하얀 고름 중심
          ctx.beginPath();
          ctx.arc(px, py, p.size * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        });

        // 3. 손가락 추적 및 꼬집기(Pinch) 감지
        if (results.landmarks && results.landmarks[0]) {
          const landmarks = results.landmarks[0];
          const thumb = landmarks[4]; 
          const index = landmarks[8]; 

          const dist = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
          const pinchX = ((thumb.x + index.x) / 2) * canvas.width;
          const pinchY = ((thumb.y + index.y) / 2) * canvas.height;

          // 꼬집기 지점 시각화 (피드백)
          ctx.beginPath();
          ctx.arc(pinchX, pinchY, 12, 0, Math.PI * 2);
          ctx.fillStyle = dist < 0.05 ? "#FFD700" : "rgba(255,255,255,0.5)";
          ctx.fill();

          // 4. 여드름 충돌 및 터뜨리기 판정
          if (dist < 0.05) {
            pimples.forEach((p, pIndex) => {
              const dx = pinchX - (p.x * canvas.width);
              const dy = pinchY - (p.y * canvas.height);
              const distToPimple = Math.sqrt(dx*dx + dy*dy);

              if (distToPimple < p.size) {
                // [터짐!] 
                pimples.splice(pIndex, 1); // 리스트에서 삭제
                score++;
                
                // 📱 모바일 진동 효과 (0.05초)
                if (typeof window !== 'undefined' && window.navigator.vibrate) {
                  window.navigator.vibrate(50);
                }

                // 파티클 생성
                for (let i = 0; i < 25; i++) {
                  particles.push({
                    x: pinchX, y: pinchY,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    life: 1.0,
                    color: `hsl(${45 + Math.random() * 20}, 100%, 80%)`
                  });
                }
                spawnPimple(); // 새 여드름 생성
              }
            });
          }
        }

        // 5. 파티클 애니메이션
        particles.forEach((p, i) => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.life -= 0.025;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.life;
          ctx.fill();
          if (p.life <= 0) particles.splice(i, 1);
        });
        ctx.globalAlpha = 1.0;

        // 6. 점수 표시 (거울모드 해제 후 텍스트 작성)
        ctx.restore();
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        ctx.fillText(`Pimples Popped: ${score}`, 20, 40);

        animationFrameId = requestAnimationFrame(render);
      };
      render();
    };

    setupHandDetection();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <main style={{ width: '100vw', height: '100dvh', backgroundColor: '#000', overflow: 'hidden', position: 'fixed' }}>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />
    </main>
  );
}