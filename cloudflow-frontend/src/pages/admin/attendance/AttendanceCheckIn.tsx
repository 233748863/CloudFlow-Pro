import React, { useState, useEffect } from 'react';
import { MapPin, Wifi, Clock, AlertCircle } from 'lucide-react';
import { checkIn, getAttendanceRule, AttendanceRule } from '@/services/api/admin';
import { format } from 'date-fns';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { useMount } from '@/hooks/useMount';


const AttendanceCheckIn: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [rule, setRule] = useState<AttendanceRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{success: boolean, msg: string} | null>(null);

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取规则
  useMount(() => {
    getAttendanceRule().then(res => {
        // @ts-ignore
        setRule(res.data || res);
    });
  });

  // 获取位置
  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("您的浏览器不支持地理定位");
      return;
    }
    
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationError(null);
        setLoading(false);
      },
      (error) => {
        setLocationError("获取位置失败: " + error.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  useMount(() => {
    getLocation();
  });

  const handleCheckIn = async (type: '1' | '2') => {
    if (!location) {
        // 尝试重新获取
        getLocation();
        if(!location) return;
    }

    setLoading(true);
    try {
      await checkIn({
        type,
        location: `${location.lat},${location.lng}`,
        address: "Web端定位", // 实际项目可调用逆地理编码API
        deviceInfo: navigator.userAgent,
        wifiInfo: "Web端无法获取Mac" // Web端限制
      });
      setResult({ success: true, msg: type === '1' ? '签到成功' : '签退成功' });
    } catch (error) {
      setResult({ success: false, msg: '打卡失败，请重试' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center bg-primary text-primary-foreground rounded-t-lg py-6">
          <CardTitle className="text-2xl">考勤打卡</CardTitle>
          <p className="opacity-90 mt-2">{format(currentTime, 'yyyy年MM月dd日 EEEE')}</p>
        </CardHeader>
        <CardContent className="flex flex-col items-center pt-8 space-y-6">
          
          {/* 时间显示 */}
          <div className="text-5xl font-mono font-bold text-gray-800 tracking-wider">
            {format(currentTime, 'HH:mm:ss')}
          </div>

          {/* 规则信息 */}
          {rule && (
            <div className="flex items-center space-x-4 text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-full">
                <span className="flex items-center"><Clock className="w-4 h-4 mr-1"/> 上班: {rule.checkInTime}</span>
                <span className="flex items-center"><Clock className="w-4 h-4 mr-1"/> 下班: {rule.checkOutTime}</span>
            </div>
          )}

          {/* 定位状态 */}
          <div className="flex flex-col items-center space-y-2">
            {location ? (
              <div className="flex items-center text-green-600">
                <MapPin className="w-5 h-5 mr-1" />
                <span>已定位: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
              </div>
            ) : (
              <div className="flex items-center text-red-500">
                <AlertCircle className="w-5 h-5 mr-1" />
                <span>{locationError || "正在定位..."}</span>
              </div>
            )}
            
            <div className="flex items-center text-gray-400 text-xs">
              <Wifi className="w-3 h-3 mr-1" />
              <span>Wi-Fi 校验暂不支持 (Web端)</span>
            </div>
          </div>

          {/* 打卡按钮组 */}
          <div className="grid grid-cols-2 gap-6 w-full pt-4">
            <Button 
              className="h-32 rounded-xl text-lg flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-700 transition-all active:scale-95"
              onClick={() => handleCheckIn('1')}
              disabled={loading || !location}
            >
              <div className="text-2xl font-bold mb-1">上班打卡</div>
              <div className="text-sm opacity-80">Click to Check In</div>
            </Button>
            
            <Button 
              className="h-32 rounded-xl text-lg flex flex-col items-center justify-center bg-orange-500 hover:bg-orange-600 transition-all active:scale-95"
              onClick={() => handleCheckIn('2')}
              disabled={loading || !location}
            >
              <div className="text-2xl font-bold mb-1">下班签退</div>
              <div className="text-sm opacity-80">Click to Check Out</div>
            </Button>
          </div>

          {/* 结果提示 */}
          {result && (
            <div className={`mt-4 p-3 rounded-md w-full text-center ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {result.msg}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceCheckIn;
