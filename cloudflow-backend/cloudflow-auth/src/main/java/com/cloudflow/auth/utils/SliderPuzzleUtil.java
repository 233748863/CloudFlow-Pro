package com.cloudflow.auth.utils;

import com.cloudflow.common.core.utils.SysConfigHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.GeneralPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Random;

/**
 * 滑块验证码工具类
 * <p>
 * 图片尺寸参数从 sys_config 表动态读取（全局配置）：
 * - sys.captcha.width（ID 36）：背景图宽度，默认 300
 * - sys.captcha.height（ID 37）：背景图高度，默认 150
 * - sys.captcha.puzzleSize（ID 38）：拼图块大小，默认 44
 * - sys.captcha.circleRadius（ID 39）：圆弧半径，默认 8
 *
 * @author CloudFlow
 */
@Slf4j
@Component
public class SliderPuzzleUtil {

    /** 默认值常量 */
    private static final int DEFAULT_WIDTH = 300;
    private static final int DEFAULT_HEIGHT = 150;
    private static final int DEFAULT_PUZZLE_SIZE = 44;
    private static final int DEFAULT_CIRCLE_R = 8;

    private static SysConfigHelper configHelper;

    @Autowired(required = false)
    public void setSysConfigHelper(SysConfigHelper helper) {
        SliderPuzzleUtil.configHelper = helper;
    }

    /** 获取背景图宽度 */
    private static int getWidth() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.width", DEFAULT_WIDTH);
        }
        return DEFAULT_WIDTH;
    }

    /** 获取背景图高度 */
    private static int getHeight() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.height", DEFAULT_HEIGHT);
        }
        return DEFAULT_HEIGHT;
    }

    /** 获取拼图块逻辑宽度 */
    private static int getPuzzleSize() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.puzzleSize", DEFAULT_PUZZLE_SIZE);
        }
        return DEFAULT_PUZZLE_SIZE;
    }

    /** 获取凸出圆弧半径 */
    private static int getCircleR() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.circleRadius", DEFAULT_CIRCLE_R);
        }
        return DEFAULT_CIRCLE_R;
    }

    public static class CaptchaData {
        private String bgImage;
        private String sliderImage;
        private int x;
        private int y;
        private int sliderWidth;
        private int sliderHeight;

        public String getBgImage() { return bgImage; }
        public void setBgImage(String bgImage) { this.bgImage = bgImage; }
        public String getSliderImage() { return sliderImage; }
        public void setSliderImage(String sliderImage) { this.sliderImage = sliderImage; }
        public int getX() { return x; }
        public void setX(int x) { this.x = x; }
        public int getY() { return y; }
        public void setY(int y) { this.y = y; }
        public int getSliderWidth() { return sliderWidth; }
        public void setSliderWidth(int sliderWidth) { this.sliderWidth = sliderWidth; }
        public int getSliderHeight() { return sliderHeight; }
        public void setSliderHeight(int sliderHeight) { this.sliderHeight = sliderHeight; }
    }

    /**
     * 创建拼图路径（相对于原点）
     * 路径范围: x=[0, puzzleSize+circleR], y=[-circleR, puzzleSize]
     */
    private static GeneralPath createPuzzlePath(int puzzleSize, int circleR) {
        GeneralPath path = new GeneralPath();
        // 起点：左上角
        path.moveTo(0, 0);
        // 顶边 + 顶部凸出 tab
        path.lineTo(puzzleSize / 2.0 - circleR, 0);
        path.curveTo(
            puzzleSize / 2.0 - circleR, -circleR,
            puzzleSize / 2.0 + circleR, -circleR,
            puzzleSize / 2.0 + circleR, 0
        );
        path.lineTo(puzzleSize, 0);
        // 右边 + 右侧凸出 tab
        path.lineTo(puzzleSize, puzzleSize / 2.0 - circleR);
        path.curveTo(
            puzzleSize + circleR, puzzleSize / 2.0 - circleR,
            puzzleSize + circleR, puzzleSize / 2.0 + circleR,
            puzzleSize, puzzleSize / 2.0 + circleR
        );
        path.lineTo(puzzleSize, puzzleSize);
        // 底边
        path.lineTo(0, puzzleSize);
        // 左边 + 左侧凹入 tab
        path.lineTo(0, puzzleSize / 2.0 + circleR);
        path.curveTo(
            circleR, puzzleSize / 2.0 + circleR,
            circleR, puzzleSize / 2.0 - circleR,
            0, puzzleSize / 2.0 - circleR
        );
        path.closePath();
        return path;
    }

    /**
     * 生成滑块验证码数据
     *
     * @return 包含背景图、滑块图、坐标等信息的验证码数据
     */
    public static CaptchaData createCaptcha() {
        // 从配置中读取尺寸参数
        int width = getWidth();
        int height = getHeight();
        int puzzleSize = getPuzzleSize();
        int circleR = getCircleR();
        int sliderImgWidth = puzzleSize + circleR;
        int sliderImgHeight = puzzleSize + circleR;

        CaptchaData data = new CaptchaData();
        Random random = new Random();

        // 1. 生成背景图
        BufferedImage bg = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D gBg = bg.createGraphics();
        gBg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // 渐变背景
        Color c1 = new Color(30 + random.nextInt(100), 50 + random.nextInt(100), 80 + random.nextInt(150));
        Color c2 = new Color(30 + random.nextInt(100), 50 + random.nextInt(100), 80 + random.nextInt(150));
        GradientPaint gp = new GradientPaint(0, 0, c1, width, height, c2);
        gBg.setPaint(gp);
        gBg.fillRect(0, 0, width, height);

        // 添加噪点/装饰
        for (int i = 0; i < 20; i++) {
            gBg.setColor(new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255), 80));
            int r = 10 + random.nextInt(40);
            gBg.fillOval(random.nextInt(width), random.nextInt(height), r, r);
        }
        // 添加线条增加复杂度
        for (int i = 0; i < 5; i++) {
            gBg.setColor(new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255), 60));
            gBg.setStroke(new BasicStroke(1 + random.nextInt(2)));
            gBg.drawLine(random.nextInt(width), random.nextInt(height), random.nextInt(width), random.nextInt(height));
        }

        // 2. 确定拼图位置
        int targetX = sliderImgWidth + random.nextInt(width - 2 * sliderImgWidth);
        int targetY = circleR + random.nextInt(height - puzzleSize - circleR * 2);

        // 存储验证用的 X 坐标
        data.setX(targetX);

        // 3. 创建拼图路径
        GeneralPath path = createPuzzlePath(puzzleSize, circleR);

        // 4. 创建滑块图片（带透明通道）
        BufferedImage slider = new BufferedImage(sliderImgWidth, sliderImgHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gSlider = slider.createGraphics();
        gSlider.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // 将绘图原点下移 circleR，使顶部 tab（y=-circleR）映射到图片 y=0
        gSlider.translate(0, circleR);

        // 用拼图路径裁剪
        gSlider.setClip(path);
        // 从背景图中提取对应区域
        gSlider.drawImage(bg, -targetX, -targetY, null);

        // 绘制拼图块边框（白色半透明）
        gSlider.setClip(null);
        gSlider.setColor(new Color(255, 255, 255, 220));
        gSlider.setStroke(new BasicStroke(2.0f));
        gSlider.draw(path);

        // 添加内阴影效果
        gSlider.setColor(new Color(0, 0, 0, 40));
        gSlider.setStroke(new BasicStroke(1.0f));
        gSlider.draw(path);

        gSlider.dispose();

        // 5. 在背景图上绘制缺口
        Graphics2D gBg2 = bg.createGraphics();
        gBg2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        gBg2.translate(targetX, targetY);
        // 半透明黑色填充缺口
        gBg2.setColor(new Color(0, 0, 0, 160));
        gBg2.fill(path);
        // 缺口边框
        gBg2.setColor(new Color(255, 255, 255, 80));
        gBg2.setStroke(new BasicStroke(1.5f));
        gBg2.draw(path);
        gBg2.dispose();

        gBg.dispose();

        // 6. 前端需要的 Y 坐标（滑块图片的 top 位置）
        data.setY(targetY - circleR);
        data.setSliderWidth(sliderImgWidth);
        data.setSliderHeight(sliderImgHeight);

        // 7. 编码为 Base64
        try {
            data.setBgImage(toBase64(bg));
            data.setSliderImage(toBase64(slider));
        } catch (IOException e) {
            throw new RuntimeException("验证码图片生成失败", e);
        }

        return data;
    }

    private static String toBase64(BufferedImage image) throws IOException {
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        ImageIO.write(image, "png", os);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(os.toByteArray());
    }
}
