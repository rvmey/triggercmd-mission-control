pipeline {
    agent any

    options {
        skipDefaultCheckout()
    }

    stages {
        
     stage('prepare') {
        steps {
            checkout([
                $class: 'GitSCM',
                branches: [[name: '*/main']],
                userRemoteConfigs: [[
                    credentialsId: "jenkins",
                    url: 'git@github.com:rvmey/triggercmd-mission-control.git'
                ]]
            ])
        }
     }

        stage('build ubuntu') {
            agent {
                docker {
                    image 'node:23.5-bullseye'
                    args '-u root'
                    reuseNode true
                }
            }

            steps {
                sh './ubuntubuild.sh'
            }
        }

        stage('copy rpm and deb artifacts') {
            steps {
                sh 'cp -r ./out/make/* /mnt/nas/TriggerCMD/'
            }
        }
        
    }
}
