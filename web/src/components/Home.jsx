
import LiquidEther from './LiquidEther';

function Home() {
  return (
    <div className="home">
      <LiquidEther
        colors={['#f59e0b', '#a855f7', '#ea580c']}
        mouseForce={20}
        cursorSize={100}
        isViscous={false}
        viscous={30}
        iterationsViscous={32}
        iterationsPoisson={32}
        resolution={0.5}
        isBounce={false}
        autoDemo={true}
        autoSpeed={0.5}
        autoIntensity={2.2}
        takeoverDuration={0.25}
        autoResumeDelay={2000}
        autoRampDuration={0.6}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        }}
      />
      <div className="spotlight-container" style={{ position: 'relative', zIndex: 10 }}>
        <p className="spotlight-subtitle">
          The language of tomorrow,<br />
          spoken now.
        </p>
      </div>
    </div>
  )
}

export default Home