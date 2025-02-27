import { Sender } from '@ant-design/x';
import { App } from 'antd';
import React from 'react';
import { io } from 'socket.io-client';

const Demo = () => {
  const { message } = App.useApp();
  const [recording, setRecording] = React.useState(false);
  const [mediaRecorder, setMediaRecorder] = React.useState(null);
  const [socket, setSocket] = React.useState(null);
  const audioContextRef = React.useRef(null);
  const processorRef = React.useRef(null);
  const [recognitionResult, setRecognitionResult] = React.useState('');
  const [intermediateResult, setIntermediateResult] = React.useState('');
  const sentencesRef = React.useRef({});

  // 更新句子并重新生成显示文本
  const updateSentences = (sentenceId, text, isEnd) => {
    // 更新字典中的句子
    if (text) {
      sentencesRef.current[sentenceId] = text;
    }

    // 按句子ID排序并拼接所有句子
    const sortedText = Object.entries(sentencesRef.current)
      .sort(([idA], [idB]) => Number(idA) - Number(idB))
      .map(([_, text]) => text)
      .join(' ');

    // 更新显示内容
    setRecognitionResult(sortedText);

    // 处理中间结果
    if (!isEnd) {
      setIntermediateResult(text || '');
    } else {
      setIntermediateResult('');
    }
  };

  // 初始化音频流和 Socket.IO 连接
  const initAudioStream = async () => {
    try {
      // 请求音频流，设置采样率为16kHz，单声道
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // 创建 AudioContext，固定采样率为16kHz
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({
          sampleRate: 16000,
        });
      }

      // 创建 Socket.IO 连接
      const socketIO = io('http://localhost:8080/audio');
      
      socketIO.on('connect', () => {
        console.log('Socket.IO 连接已建立');
      });

      socketIO.on('disconnect', () => {
        console.log('Socket.IO 连接已断开');
        message.warning('服务器连接已断开');
      });

      socketIO.on('error', (error) => {
        console.error('Socket.IO 错误:', error);
        message.error('Socket.IO 连接错误');
      });

      socketIO.on('recognition', (data) => {
        console.log('收到识别结果:', {
          文本内容: data.text,
          是否结束: data.is_end,
          句子ID: data.sentence_id,
          累积文本: data.accumulated_text,
          请求ID: data.request_id,
          用量信息: data.usage,
          完整数据: data
        });

        if (data.sentence_id !== undefined) {
          updateSentences(data.sentence_id, data.text, data.is_end);
        }
      });

      setSocket(socketIO);

      // 创建音频处理管道
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 处理音频数据
      processor.onaudioprocess = (e) => {
        if (socketIO.connected) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // 将 Float32 转换为 16位 PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          // 转换为 Uint8Array 以确保正确的二进制传输
          const uint8Array = new Uint8Array(pcmData.buffer);
          
          // 直接发送原始 PCM 数据
          socketIO.emit('audio', uint8Array);
        }
      };

      // 连接音频节点
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      setMediaRecorder(stream);
    } catch (error) {
      console.error('初始化音频流错误:', error);
      message.error('获取麦克风权限失败：' + error.message);
      setRecording(false);
    }
  };

  // 清理资源
  const cleanupAudioStream = () => {
    if (mediaRecorder) {
      mediaRecorder.getTracks().forEach(track => track.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (socket) {
      socket.disconnect();
    }
    setMediaRecorder(null);
    setSocket(null);
    setIntermediateResult('');
    sentencesRef.current = {};  // 只清空句子字典，为下一次录音做准备
  };

  React.useEffect(() => {
    return () => {
      cleanupAudioStream();
    };
  }, []);

  return (
    <div>
      <Sender
        value={recognitionResult}
        onChange={(v) => {
          setRecognitionResult(v);
        }}
        onSubmit={() => {
          message.success('Send message successfully!');
        }}
        allowSpeech={{
          recording,
          onRecordingChange: async (nextRecording) => {
            setRecording(nextRecording);
            if (nextRecording) {
              await initAudioStream();
            } else {
              cleanupAudioStream();
            }
            message.info(`录音状态: ${nextRecording ? '开始' : '停止'}`);
          },
        }}
      />
    </div>
  );
};

export default () => (
  <App>
    <Demo />
  </App>
);
